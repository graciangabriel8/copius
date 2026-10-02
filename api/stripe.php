<?php
/* POST from Stripe, the webhook (DESIGN-PAYMENT.md section 4): signature first,
   then one transaction per event: the event id recorded (a duplicate ends
   there), the state applied, the mails queued. A failure answers 500, so Stripe
   sends the whole event again. Events of the shared account that are not
   Copius's answer 200 and are ignored. */
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

/* The order an invoice belongs to: its subscription's metadata as the invoice
   carries it, else a subscription already on file. */
function invoice_order(array $o): array {
    $d = $o['parent']['subscription_details'] ?? null;
    $sid = is_array($d) ? ($d['subscription'] ?? null) : null;
    if (is_array($sid)) $sid = $sid['id'] ?? null;
    if (!is_string($sid)) return [null, null];
    $order = our_order($d['metadata'] ?? null);
    if (!$order) {
        $known = q('SELECT order_id FROM subscriptions WHERE id = ?', [$sid])->fetch();
        if ($known) $order = q('SELECT * FROM orders WHERE id = ?', [$known['order_id']])->fetch() ?: null;
    }
    return [$sid, $order];
}

/* One event, inside its transaction. Returns a word for api.log; $ref is the
   order whose queued mails are sent once Stripe has its answer. */
function handle(string $type, array $o, ?string &$ref): string {
    switch ($type) {
    case 'checkout.session.completed':
        $order = our_order($o['metadata'] ?? null);
        if (!$order || ($o['client_reference_id'] ?? '') !== $order['id']) return 'foreign';
        if (($o['payment_status'] ?? '') === 'paid') q("UPDATE orders SET status = 'paid' WHERE id = ?", [$order['id']]);
        if (is_string($o['subscription'] ?? null)) refresh_sub($o['subscription'], $order);
        return 'applied';

    case 'invoice.paid':
        [$sid, $order] = invoice_order($o);
        if (!$order) return 'foreign';
        $sub = refresh_sub($sid, $order);
        $start = $end = null;
        foreach ($o['lines']['data'] ?? [] as $l) {
            $p = $l['period'] ?? [];
            if (isset($p['end']) && ($end === null || (int)$p['end'] > $end)) { $end = (int)$p['end']; $start = (int)$p['start']; }
        }
        if ($end === null) throw new RuntimeException('invoice without a period');
        $paid = (int)($o['status_transitions']['paid_at'] ?? now());
        $cents = (int)($o['amount_paid'] ?? 0);
        if (!q('SELECT 1 FROM payments WHERE invoice = ?', [$o['id']])->fetch()) {
            q('INSERT INTO payments (invoice, subscription, amount, paid_at, payment_intent) VALUES (?, ?, ?, ?, ?)',
              [$o['id'], $sid, $cents, $paid, invoice_intent((string)$o['id'])]);
        }
        if (!$sub['paid_until'] || paris_date($end) > $sub['paid_until']) {
            q('UPDATE subscriptions SET paid_from = ?, paid_until = ?, amount = ?, retry_until = NULL WHERE id = ?',
              [paris_date($start), paris_date($end), $cents, $sid]);
        }
        if (!$sub['started']) q('UPDATE subscriptions SET started = ? WHERE id = ?', [paris_date($paid), $sid]);
        q("UPDATE orders SET status = 'paid' WHERE id = ?", [$order['id']]);
        if (($o['billing_reason'] ?? '') === 'subscription_create') {
            /* Access opens when this mail is sent (send_outbox), not before. */
            queue('confirm', 'confirm:' . $order['id'], $order['email'], $order['lang'], $order['id'], [
                'plan' => $order['plan'], 'cents' => $cents, 'started' => paris_date($paid), 'next' => paris_date($end),
                'cgv' => $order['cgv_version'], 'cgv_at' => (int)$order['cgv_at'],
            ]);
            $ref = $order['id'];
        }
        sync_grant($order['email']);
        return 'applied';

    case 'invoice.payment_failed':
        [$sid, $order] = invoice_order($o);
        if (!$order) return 'foreign';
        refresh_sub($sid, $order);
        $retry = add_days(paris_date((int)($o['created'] ?? now())), RETRY_DAYS);
        q('UPDATE subscriptions SET retry_until = ? WHERE id = ?', [$retry, $sid]);
        if (($o['billing_reason'] ?? '') !== 'subscription_create') {
            queue('failed', 'failed:' . $o['id'], $order['email'], $order['lang'], $order['id'],
                ['plan' => $order['plan'], 'cents' => (int)($o['amount_due'] ?? 0), 'until' => $retry, 'ref' => $order['id'],
                 'pay' => (string)($o['hosted_invoice_url'] ?? '')]);
            $ref = $order['id'];
        }
        sync_grant($order['email']);
        return 'applied';

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
        $sid = (string)($o['id'] ?? '');
        $order = our_order($o['metadata'] ?? null);
        if (!$order) {
            $known = q('SELECT order_id FROM subscriptions WHERE id = ?', [$sid])->fetch();
            if (!$known) return 'foreign';
            $order = q('SELECT * FROM orders WHERE id = ?', [$known['order_id']])->fetch() ?: null;
        }
        $sub = refresh_sub($sid, $order);
        if ($sub) sync_grant((string)$sub['email']);
        return 'applied';

    case 'charge.dispute.created':
    case 'refund.created':
        $pi = $o['payment_intent'] ?? null;
        if (is_array($pi)) $pi = $pi['id'] ?? null;
        $pay = is_string($pi) ? q('SELECT * FROM payments WHERE payment_intent = ?', [$pi])->fetch() : null;
        if (!$pay) return 'foreign';
        $sub = q('SELECT * FROM subscriptions WHERE id = ?', [$pay['subscription']])->fetch();
        if ($type === 'refund.created') {
            if (isset($o['metadata']['copius'])) return 'ours';
            q('UPDATE payments SET refunded = refunded + ? WHERE invoice = ?', [(int)($o['amount'] ?? 0), $pay['invoice']]);
            alert('refund:' . $o['id'], 'A refund of ' . (int)($o['amount'] ?? 0) . " cents on {$pay['invoice']} ({$sub['email']}) " .
                'was not issued by Copius: check that access and the records are as they should be.');
            return 'alerted';
        }
        /* A dispute ends the subscription at once and closes access. */
        if (in_array($sub['status'], ['active', 'trialing', 'past_due'], true)) {
            [$code, $s] = stripe('DELETE', '/v1/subscriptions/' . rawurlencode((string)$sub['id']));
            if ($code !== 200 || !$s) throw new RuntimeException("dispute cancel $code");
            refresh_sub((string)$sub['id'], null, $s);
        }
        sync_grant((string)$sub['email']);
        alert('dispute:' . $o['id'], "A dispute was opened on {$pay['invoice']} ({$sub['email']}): the subscription is cancelled and access closed. Answer it in Stripe.");
        return 'applied';
    }
    return 'unhandled';
}

$ref = null;
try {
    $outcome = tx(function () use ($ev, $obj, &$ref) {
        try { q('INSERT INTO processed_events (id, at) VALUES (?, ?)', [$ev['id'], now()]); }
        catch (PDOException $e) { if ($e->getCode() === '23000') return 'duplicate'; throw $e; }
        return handle($ev['type'], $obj, $ref);
    });
} catch (Throwable $e) {
    log_php('stripe ' . $ev['type'] . ': ' . describe($e));
    json_out(500); log_api('failed'); exit;
}
json_out(200, ['ok' => true]);
log_api($ev['type'] . ' ' . $outcome);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
if ($ref !== null) send_outbox(10, $T0 + 140, $ref);
