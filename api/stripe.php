<?php
/* POST from Stripe, the webhook (DESIGN-PAYMENT.md section 4): signature first,
   then one transaction per event: the state applied, the mails queued. Every
   handler can run twice with one effect (payments keyed by invoice, refunds by
   Stripe's id, mails by their dedupe key, subscriptions re-read), which is what
   makes a duplicate delivery harmless; two copies handled at the same moment can
   still meet on a key or a lock, answer 500, and settle on Stripe's retry. A failure answers 500, so Stripe sends
   the whole event again. Events of the shared account that are not
   Copius's answer 200 and are ignored; one that names a Copius-shaped order we
   do not have is answered 200 and handed to Gabriel. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_mail.php';
require __DIR__ . '/_pay.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$secret = (string)cfg('stripe_webhook_secret');
if (!preg_match('/^whsec_[A-Za-z0-9]{24,}$/', $secret)) { json_out(503); log_api('no_secret'); exit; }
$body = (string)file_get_contents('php://input', false, null, 0, 1048577);
if (strlen($body) > 1048576) { json_out(413); log_api('too_large'); exit; }
if (!signature_ok($body, (string)($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? ''), $secret, now())) {
    json_out(400); log_api('bad_signature'); exit;
}
$ev = json_decode($body, true);
$obj = is_array($ev) ? ($ev['data']['object'] ?? null) : null;
if (!is_string($ev['id'] ?? null) || !is_string($ev['type'] ?? null) || !is_array($obj)) { json_out(400); log_api('bad_event'); exit; }

/* Not ours, or ours but unknown: an order id of our shape with no order row
   (deleted, or never written) means a buyer Copius has lost track of. */
function not_found(?array $meta, string $what): string {
    $id = order_id($meta);
    if ($id === null) return 'foreign';
    alert('unknown:' . $id, "Stripe sent $what for order $id, which Copius does not have: the buyer may be paying without access. Look the order up in Stripe.");
    return 'unknown';
}

/* The subscription and order an invoice belongs to: its subscription's
   metadata as the invoice carries it, else a subscription already on file. */
function invoice_order(array $o): array {
    $d = $o['parent']['subscription_details'] ?? null;
    $sid = is_array($d) ? ($d['subscription'] ?? null) : null;
    if (is_array($sid)) $sid = $sid['id'] ?? null;
    if (!is_string($sid)) return [null, null, null];
    $meta = is_array($d['metadata'] ?? null) ? $d['metadata'] : null;
    $order = our_order($meta);
    if (!$order) {
        $known = q('SELECT order_id FROM subscriptions WHERE id = ?', [$sid])->fetch();
        if ($known) $order = row('orders', $known['order_id']);
    }
    return [$sid, $order, $meta];
}

/* One event, inside its transaction. Returns a word for api.log; $ref is the
   order whose queued mails are sent once Stripe has its answer. */
function handle(string $type, array $o, ?string &$ref): string {
    switch ($type) {
    case 'checkout.session.completed':
        $order = our_order($o['metadata'] ?? null);
        if (!$order) return not_found($o['metadata'] ?? null, 'a completed checkout');
        if (($o['client_reference_id'] ?? '') !== $order['id']) return 'foreign';
        if (($o['payment_status'] ?? '') === 'paid') q("UPDATE orders SET status = 'paid' WHERE id = ?", [$order['id']]);
        if (is_string($o['subscription'] ?? null)) refresh_sub($o['subscription'], $order);
        return 'applied';

    case 'invoice.paid':
        [$sid, $order, $meta] = invoice_order($o);
        if (!$order) return $sid ? not_found($meta, "a paid invoice ({$o['id']})") : 'foreign';
        $sub = refresh_sub($sid, $order);
        $paid = (int)($o['status_transitions']['paid_at'] ?? now());
        $cents = (int)($o['amount_paid'] ?? 0);
        insert_once('INSERT INTO payments (invoice, subscription, amount, paid_at, payment_intent) VALUES (?, ?, ?, ?, ?)',
            [$o['id'], $sid, $cents, $paid, invoice_intent((string)$o['id'])]);
        q("UPDATE orders SET status = 'paid' WHERE id = ?", [$order['id']]);
        $reason = (string)($o['billing_reason'] ?? '');
        if ($reason !== 'subscription_create' && $reason !== 'subscription_cycle') {
            alert('reason:' . $o['id'], "Invoice {$o['id']} of {$order['email']} ($sid) was paid with billing_reason « $reason », which Copius does not handle (a change made in the Dashboard?): the payment is recorded, the period is not. Check the subscription by hand.");
            return 'alerted';
        }
        if (!in_array($sub['status'], array_merge(LIVE, ['incomplete']), true)) {
            alert('late:' . $o['id'], "Invoice {$o['id']} of {$order['email']} was paid while its subscription $sid is « {$sub['status']} »: no access follows. Refund it, or reinstate the subscription by hand.");
            return 'alerted';
        }
        $start = $end = null;
        foreach ($o['lines']['data'] ?? [] as $l) {
            $p = $l['period'] ?? [];
            if (isset($p['end']) && ($end === null || (int)$p['end'] > $end)) { $end = (int)$p['end']; $start = (int)$p['start']; }
        }
        if ($end === null) throw new RuntimeException('invoice without a period');
        if (!$sub['paid_until'] || paris_date($end) > $sub['paid_until']) {
            q('UPDATE subscriptions SET paid_from = ?, paid_until = ?, amount = ?, retry_until = NULL WHERE id = ?',
              [paris_date($start), paris_date($end), $cents, $sid]);
        }
        if (!$sub['started']) q('UPDATE subscriptions SET started = ? WHERE id = ?', [paris_date($paid), $sid]);
        if ($reason === 'subscription_create') {
            $other = q("SELECT s.id FROM subscriptions s JOIN orders o ON o.id = s.order_id WHERE s.email = ? AND s.id <> ?
                        AND s.status IN ('active', 'trialing', 'past_due') AND o.confirmed_at IS NOT NULL", [$order['email'], $sid])->fetch();
            if ($other) alert('dup:' . $sid, "{$order['email']} now pays two subscriptions ({$other['id']} and $sid): two orders paid at once? Offer to cancel and refund one.");
            /* Access opens when this mail is sent (send_outbox), not before. */
            queue('confirm', 'confirm:' . $order['id'], $order['email'], $order['lang'], $order['id'], [
                'plan' => $order['plan'], 'cents' => $cents, 'started' => paris_date($paid), 'next' => paris_date($end),
                'cgv' => $order['cgv_version'], 'cgv_at' => (int)$order['cgv_at'],
            ]);
            $ref = $order['id'];
        }
        return 'applied';

    case 'invoice.payment_failed':
        [$sid, $order, $meta] = invoice_order($o);
        if (!$order) return $sid ? not_found($meta, "a failed invoice ({$o['id']})") : 'foreign';
        refresh_sub($sid, $order);
        /* Stripe's retry window runs from the first attempt, made when the invoice is
           finalized (about an hour after it is drafted), not from its creation. */
        $tried = (int)($o['status_transitions']['finalized_at'] ?? $o['created'] ?? now());
        $retry = add_days(paris_date($tried), RETRY_DAYS);
        q('UPDATE subscriptions SET retry_until = ? WHERE id = ?', [$retry, $sid]);
        if (($o['billing_reason'] ?? '') !== 'subscription_create') {
            /* Events come in any order: a retry that went through since says nothing failed. */
            [$code, $inv] = stripe('GET', '/v1/invoices/' . rawurlencode((string)$o['id']));
            if ($code !== 200 || !$inv) throw new RuntimeException("invoice read $code");
            if (($inv['status'] ?? '') !== 'paid') {
                queue('failed', 'failed:' . $o['id'], $order['email'], $order['lang'], $order['id'],
                    ['plan' => $order['plan'], 'cents' => (int)($o['amount_due'] ?? 0), 'until' => $retry, 'ref' => $order['id'],
                     'pay' => (string)($inv['hosted_invoice_url'] ?? '')]);
                $ref = $order['id'];
            }
        }
        return 'applied';

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
        $sid = (string)($o['id'] ?? '');
        $order = our_order($o['metadata'] ?? null);
        if (!$order) {
            $known = q('SELECT order_id FROM subscriptions WHERE id = ?', [$sid])->fetch();
            if (!$known) return not_found($o['metadata'] ?? null, "an update of subscription $sid");
            $order = row('orders', $known['order_id']);
        }
        refresh_sub($sid, $order);
        return 'applied';

    case 'charge.dispute.created':
    case 'refund.created':
    case 'refund.updated':
        $pi = $o['payment_intent'] ?? null;
        if (is_array($pi)) $pi = $pi['id'] ?? null;
        $pay = is_string($pi) ? q('SELECT * FROM payments WHERE payment_intent = ?', [$pi])->fetch() : null;
        if (!$pay) return 'foreign';
        $sub = row('subscriptions', $pay['subscription']);
        if ($type !== 'charge.dispute.created') {
            $ours = isset($o['metadata']['copius']);
            $new = record_refund($o, (string)$pay['invoice']);
            if ($new && !$ours) alert('refund:' . $o['id'], 'A refund of ' . (int)($o['amount'] ?? 0) . " cents on {$pay['invoice']} ({$sub['email']}) " .
                'was not issued by Copius: check that access and the records are as they should be.');
            if (($o['status'] ?? '') === 'failed') alert('rfail:' . $o['id'], "Refund {$o['id']} on {$pay['invoice']} ({$sub['email']}) failed: issue it again by hand.");
            return 'recorded';
        }
        /* A dispute ends the subscription at once, which closes access. */
        if (in_array($sub['status'], LIVE, true)) {
            [$code, $s] = stripe('DELETE', '/v1/subscriptions/' . rawurlencode((string)$sub['id']));
            if ($code !== 200 || !$s) throw new RuntimeException("dispute cancel $code");
            refresh_sub((string)$sub['id'], null, $s);
        }
        alert('dispute:' . $o['id'], "A dispute was opened on {$pay['invoice']} ({$sub['email']}): the subscription is cancelled and access closed. Answer it in Stripe.");
        return 'applied';
    }
    return 'unhandled';
}

$ref = null;
try {
    $outcome = tx(function () use ($ev, $obj, &$ref) { return handle($ev['type'], $obj, $ref); });
} catch (Throwable $e) {
    log_php('stripe ' . $ev['type'] . ': ' . describe($e));
    json_out(500); log_api('failed'); exit;
}
json_out(200, ['ok' => true]);
log_api($ev['type'] . ' ' . $outcome);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
if ($ref !== null) send_outbox(10, $T0 + 140, $ref);
