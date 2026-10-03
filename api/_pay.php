<?php
/* Copius payments: what order, the webhook, cancel, withdraw and the hourly job
   share. The design is DESIGN-PAYMENT.md (kairos/copius-step2); section numbers
   below refer to it. Included after _lib.php and _mail.php. Access itself is
   read from these tables by paid_until() in _lib.php: nothing here writes a
   grant row. */
declare(strict_types=1);
require_once __DIR__ . '/_paymail.php';

/* The two plans of the CGV (article 4.1). The price ids live in config.php; the
   amounts here are what the pages and the mails show, and refunds are computed
   from what was actually paid. */
const PLANS = [
    'monthly' => ['cents' => 490, 'months' => 1],
    'yearly'  => ['cents' => 3900, 'months' => 12],
];
const LIVE = ['active', 'trialing', 'past_due'];
const RETRY_DAYS = 7;          // a failed renewal keeps access this long (CGV 4.4)
const EARLY_DAYS = 10;         // a cancellation takes effect at most this far ahead (CGV 9.2)
const WITHDRAW_DAYS = 14;      // CGV 7.1
const OUTBOX_TRIES = 24;       // one a run, hourly: a day, then the hourly job reports it through OVH
const STRIPE_TRIES = 24;
const NOMATCH_ACKS = 3;        // acknowledgements a day to an address that matched nothing

/* ---------- Stripe ---------- */

/* One call to Stripe's API, with the pinned version and a 10 s limit. Returns
   [status, body]; status 0 when nothing came back (timeout, DNS, TLS). A POST
   carries an Idempotency-Key, so a retry of the same step never acts twice. */
function stripe(string $method, string $path, array $form = [], ?string $idem = null): array {
    $url = rtrim((string)cfg('stripe_api'), '/') . $path;
    $body = http_build_query($form, '', '&', PHP_QUERY_RFC1738);
    if ($method === 'GET' && $body !== '') { $url .= '?' . $body; $body = ''; }
    $h = ['Authorization: Bearer ' . cfg('stripe_key'), 'Stripe-Version: ' . cfg('stripe_api_version')];
    if ($method !== 'GET') $h[] = 'Content-Type: application/x-www-form-urlencoded';
    if ($idem !== null) $h[] = 'Idempotency-Key: ' . $idem;
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $h,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
    ]);
    if ($method !== 'GET') curl_setopt($c, CURLOPT_POSTFIELDS, $body);
    $raw = curl_exec($c);
    $code = $raw === false ? 0 : (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    curl_close($c);
    $out = is_string($raw) ? json_decode($raw, true) : null;
    if ($code !== 200) log_php("stripe $method " . preg_replace('#/(sub|in|pi|cs|re)_[A-Za-z0-9]+#', '/$1_…', $path) .
        " $code " . (is_array($out) ? substr((string)($out['error']['code'] ?? $out['error']['type'] ?? ''), 0, 60) : ''));
    return [$code, is_array($out) ? $out : null];
}

/* Worth trying again: nothing came back, a conflict with a request still in
   flight, a rate limit (the account is shared with Manager and Jobs), or
   Stripe's own error. Any other refusal is final. */
function retryable(int $code): bool { return $code === 0 || $code === 409 || $code === 429 || $code >= 500; }

/* Stripe-Signature: t=<seconds>,v1=<hex>[,v1=…] over "t.body" with the endpoint's
   secret. Any v1 may match (a rolled secret signs twice); other schemes are
   ignored; t must be within 5 minutes of now. */
function signature_ok(string $body, string $header, string $secret, int $now): bool {
    $t = null; $sigs = [];
    foreach (explode(',', $header) as $part) {
        [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
        if ($k === 't' && ctype_digit($v)) $t = (int)$v;
        if ($k === 'v1' && preg_match('/^[0-9a-f]{64}$/', $v)) $sigs[] = $v;
    }
    if ($t === null || !$sigs || abs($now - $t) > 300) return false;
    $want = hash_hmac('sha256', $t . '.' . $body, $secret);
    foreach ($sigs as $s) if (hash_equals($want, $s)) return true;
    return false;
}

/* ---------- dates (Paris) ---------- */

function paris_date(int $ts): string { return date('Y-m-d', $ts); }
function add_days(string $d, int $n): string { return date('Y-m-d', strtotime("$d $n day")); }
function days_between(string $a, string $b): int {   // whole days from a to b
    return (int)round((strtotime("$b 12:00") - strtotime("$a 12:00")) / 86400);
}

/* Calendar months, kept inside the month: 31 March less a month is 28 (or 29)
   February, never 3 March. */
function add_months(string $d, int $n): string {
    [$y, $m, $day] = array_map('intval', explode('-', $d));
    $t = $y * 12 + ($m - 1) + $n;
    $y = intdiv($t, 12); $m = $t % 12 + 1;
    return sprintf('%04d-%02d-%02d', $y, $m, min($day, (int)date('t', mktime(12, 0, 0, $m, 1, $y))));
}

/* French public holidays of a year: the fixed ones, Easter Monday, Ascension and
   Whit Monday (Meeus' Gregorian Easter, so the calendar extension is not needed). */
function holidays(int $y): array {
    $a = $y % 19; $b = intdiv($y, 100); $c = $y % 100; $d = intdiv($b, 4); $e = $b % 4;
    $g = intdiv(8 * $b + 13, 25); $h = (19 * $a + $b - $d - $g + 15) % 30;
    $i = intdiv($c, 4); $k = $c % 4; $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
    $m = intdiv($a + 11 * $h + 19 * $l, 433);
    $month = intdiv($h + $l - 7 * $m + 90, 25); $day = ($h + $l - 7 * $m + 33 * $month + 19) % 32;
    $easter = sprintf('%04d-%02d-%02d', $y, $month, $day);
    $fixed = array_map(fn($md) => "$y-$md", ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25']);
    return array_merge($fixed, [add_days($easter, 1), add_days($easter, 39), add_days($easter, 50)]);
}

/* The last day to withdraw: 14 days counted from the day after the order,
   moved to the next working day when it falls on a weekend or a holiday. */
function withdraw_deadline(string $ordered): string {
    $d = add_days($ordered, WITHDRAW_DAYS);
    while ((int)date('N', strtotime($d)) >= 6 || in_array($d, holidays((int)substr($d, 0, 4)), true)) $d = add_days($d, 1);
    return $d;
}

/* ---------- storage ---------- */

function tx(callable $f) {
    $pdo = db();
    $pdo->beginTransaction();
    try { $r = $f(); $pdo->commit(); return $r; }
    catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

/* An insert that may meet its own earlier copy (a retried step): true when it
   wrote the row, false when the row was there already. */
function insert_once(string $sql, array $args): bool {
    try { q($sql, $args); return true; }
    catch (PDOException $e) { if ($e->getCode() !== '23000') throw $e; return false; }
}

function row(string $table, $id): ?array {
    return q("SELECT * FROM $table WHERE id = ?", [$id])->fetch() ?: null;
}

function row_payment(string $invoice): ?array {
    return q('SELECT * FROM payments WHERE invoice = ?', [$invoice])->fetch() ?: null;
}

/* ---------- subscriptions ---------- */

/* The order id a Stripe object carries in its metadata, if it is shaped like one. */
function order_id(?array $meta): ?string {
    $id = is_array($meta) ? (string)($meta['order'] ?? '') : '';
    return preg_match('/^[0-9a-f]{32}$/', $id) ? $id : null;
}

function our_order(?array $meta): ?array {
    $id = order_id($meta);
    return $id ? row('orders', $id) : null;
}

/* The subscription as Stripe has it now, written to its row (created from its
   order if new). Events arrive in any order, so none is trusted for state:
   every event that touches a subscription re-reads it (Stripe's own advice).
   Throws when Stripe cannot be read, so the event is retried. */
function refresh_sub(string $id, ?array $order = null, ?array $obj = null): ?array {
    if ($obj === null) {
        [$code, $obj] = stripe('GET', '/v1/subscriptions/' . rawurlencode($id));
        if ($code !== 200 || !$obj) throw new RuntimeException("subscription read $code");
    }
    $order = $order ?? our_order($obj['metadata'] ?? null);
    if ($order === null) return null;
    insert_once('INSERT INTO subscriptions (id, order_id, email, plan, status) VALUES (?, ?, ?, ?, ?)',
        [$id, $order['id'], $order['email'], $order['plan'], 'incomplete']);
    $cancel = $obj['cancel_at'] ?? null;
    if (!$cancel && !empty($obj['cancel_at_period_end'])) $cancel = $obj['items']['data'][0]['current_period_end'] ?? null;
    q('UPDATE subscriptions SET status = ?, cancel_at = ?, ended_at = ? WHERE id = ?',
      [(string)$obj['status'], $cancel ? (int)$cancel : null, isset($obj['ended_at']) ? (int)$obj['ended_at'] : null, $id]);
    return row('subscriptions', $id);
}

/* ---------- the outbox (section 5) ---------- */

/* Queue one mail; a second row with the same dedupe key is a no-op. $ref ties
   it to what it is about (an order id, or c:/w: and a request's id), for
   retention and for sending it right after the request. */
function queue(string $kind, string $dedupe, string $to, string $lang, string $ref, array $payload): void {
    insert_once('INSERT INTO outbox (kind, dedupe, to_addr, lang, ref, payload, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$kind, $dedupe, $to, $lang === 'en' ? 'en' : 'fr', $ref, json_encode($payload, JSON_UNESCAPED_UNICODE), now()]);
}

function alert(string $dedupe, string $text): void {
    queue('alert', 'alert:' . $dedupe, (string)(cfg('alert_to') ?? 'contact@copius.fr'), 'en', 'alert', ['text' => $text]);
}

/* Send what is due, oldest first: each row claimed atomically, one try per row
   and run (the next run retries; a claim outlives its try only when the run
   dies, for 10 minutes), the row's effect applied only once its mail is sent.
   A row that cannot even be built counts as a failed try and never stops the
   others. $only limits the run to one ref (a request's own mails). */
function send_outbox(int $limit, float $deadline, ?string $only = null): int {
    $sql = 'SELECT id FROM outbox WHERE sent_at IS NULL AND attempts < ? AND (claimed_at IS NULL OR claimed_at < ?)';
    $args = [OUTBOX_TRIES, now() - 600];
    if ($only !== null) { $sql .= ' AND ref = ?'; $args[] = $only; }
    $sent = 0;
    foreach (q($sql . ' ORDER BY id LIMIT ' . (int)$limit, $args)->fetchAll(PDO::FETCH_COLUMN) as $id) {
        if (microtime(true) > $deadline - 15) break;
        if (q('UPDATE outbox SET claimed_at = ?, attempts = attempts + 1 WHERE id = ? AND sent_at IS NULL AND
               (claimed_at IS NULL OR claimed_at < ?)', [now(), $id, now() - 600])->rowCount() !== 1) continue;
        $row = row('outbox', $id);
        try {
            $m = pay_mail($row);
            $err = $m === null ? 'build' : deliver($m, $deadline);
        } catch (Throwable $e) {
            $err = 'build: ' . describe($e);
        }
        if ($err !== null) {
            q('UPDATE outbox SET last_error = ?, claimed_at = NULL WHERE id = ?', [substr($err, 0, 255), $id]);
            if ((int)$row['attempts'] >= OUTBOX_TRIES && $row['kind'] !== 'alert') {
                alert('stuck:' . $id, "Mail #$id ({$row['kind']}, ref {$row['ref']}) failed " . OUTBOX_TRIES . " times: $err");
            }
            continue;
        }
        tx(function () use ($row) {
            q('UPDATE outbox SET sent_at = ?, claimed_at = NULL WHERE id = ?', [now(), $row['id']]);
            $p = json_decode((string)$row['payload'], true);
            if ($row['kind'] === 'confirm') {
                q('UPDATE orders SET confirmed_at = ? WHERE id = ? AND confirmed_at IS NULL', [now(), $row['ref']]);
            } elseif ($row['kind'] === 'notice') {
                q('UPDATE subscriptions SET notice_sent_at = ? WHERE id = ? AND notice_deadline = ?', [now(), $p['sub'], $p['deadline']]);
            }
        });
        $sent++;
    }
    return $sent;
}

/* Mails that gave up and that someone depends on (not an already-subscribed
   notice, not the answer to a request that matched nothing, which may well go
   to an address that does not exist): the hourly job reports them through
   OVH's own mail (its exit status), since our SMTP may be the very thing
   failing. Set their attempts back to 0 in phpMyAdmin once the cause is fixed,
   or delete them. */
function stuck_mail(): int {
    return (int)q("SELECT COUNT(*) FROM outbox WHERE sent_at IS NULL AND attempts >= ? AND kind <> 'already'
                   AND ref NOT LIKE 'c:%' AND ref NOT LIKE 'w:%'", [OUTBOX_TRIES])->fetchColumn();
}

/* One message out, by the configured transport. Null when it went. */
function deliver(array $m, float $deadline): ?string {
    if (cfg('transport') === 'file') return mail_to_file($m) ? null : 'file_failed';
    try { return smtp_send($m, $deadline); } catch (Throwable $e) { return 'exception'; }
}

/* A fresh sign-in link for the confirmation, made exactly as login.php makes one. */
function signin_link(string $email, string $lang): string {
    $token = b64url(random_bytes(32));
    tx(function () use ($email, $lang, $token) {
        q('DELETE FROM login_tokens WHERE email = ? AND used = 0', [$email]);
        q('INSERT INTO login_tokens (token_hash, email, lang, created, expires, used) VALUES (?, ?, ?, ?, ?, 0)',
          [hash('sha256', $token), $email, $lang, now(), now() + TOKEN_LIFE]);
    });
    return cfg('origin') . '/connexion/#t=' . $token . '&l=' . $lang;
}

/* ---------- payments and refunds ---------- */

/* The payment intent of a paid invoice, read from the invoice's payments
   (Invoices read is enough; the invoice no longer carries it). Null when it was
   paid without one; throws when Stripe cannot be read. */
function invoice_intent(string $invoice): ?string {
    [$code, $inv] = stripe('GET', '/v1/invoices/' . rawurlencode($invoice), ['expand' => ['payments']]);
    if ($code !== 200 || !$inv) throw new RuntimeException("invoice read $code");
    foreach ($inv['payments']['data'] ?? [] as $p) {
        if (($p['status'] ?? '') === 'paid' && ($p['payment']['type'] ?? '') === 'payment_intent') {
            $pi = $p['payment']['payment_intent'] ?? null;
            return is_array($pi) ? ($pi['id'] ?? null) : $pi;
        }
    }
    return null;
}

/* What has been refunded on a payment, whoever issued it. Each refund is a row
   keyed by Stripe's own id, so the same refund seen twice (a retried call, its
   webhook) counts once. */
function refunded(string $invoice): int {
    return (int)q("SELECT COALESCE(SUM(cents), 0) FROM refunds WHERE invoice = ? AND status IN ('pending', 'requires_action', 'succeeded')",
        [$invoice])->fetchColumn();
}

/* Record a Stripe refund object; true when it was new. Events come in any
   order, so a known refund's status only moves forward: pending, then
   succeeded, then failed or canceled (a refund can still fail after success). */
function record_refund(array $r, string $invoice): bool {
    $status = (string)($r['status'] ?? 'pending');
    $key = is_string($r['metadata']['copius'] ?? null) ? $r['metadata']['copius'] : null;
    $new = insert_once('INSERT INTO refunds (id, invoice, cents, status, ours, copius_key, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [(string)$r['id'], $invoice, (int)($r['amount'] ?? 0), $status, $key !== null ? 1 : 0, $key, now()]);
    if (!$new) {
        $rank = ['pending' => 0, 'requires_action' => 0, 'succeeded' => 1, 'failed' => 2, 'canceled' => 2];
        $old = (string)q('SELECT status FROM refunds WHERE id = ?', [(string)$r['id']])->fetchColumn();
        if (($rank[$status] ?? 0) >= ($rank[$old] ?? 0)) q('UPDATE refunds SET status = ? WHERE id = ?', [$status, (string)$r['id']]);
    }
    return $new;
}

/* Refund $cents of one payment under $key. Returns 200 once Stripe has it
   (or had it already: a refund recorded under the same key, whether by an
   earlier answer or by its webhook), else Stripe's status: -1 when the payment
   has no intent to refund, -2 when less is left on it than this refund (a
   refund made elsewhere since). The amount never changes between tries, so a
   retried key always carries the parameters of its first use. */
function refund(array $pay, int $cents, string $key): int {
    if ($cents <= 0 || q('SELECT 1 FROM refunds WHERE copius_key = ?', [$key])->fetch()) return 200;
    if ($cents > (int)$pay['amount'] - refunded((string)$pay['invoice'])) return -2;
    if (!$pay['payment_intent']) return -1;
    [$code, $r] = stripe('POST', '/v1/refunds', ['payment_intent' => $pay['payment_intent'], 'amount' => $cents,
        'reason' => 'requested_by_customer', 'metadata' => ['copius' => $key]], $key);
    if ($code !== 200 || !is_string($r['id'] ?? null)) return $code;
    record_refund($r, (string)$pay['invoice']);
    return 200;
}

/* A Stripe step that did not go through, on a cancellation or a withdrawal: a
   final refusal is handed to Gabriel at once; anything else is retried hourly,
   STRIPE_TRIES times, then handed to him too. */
function stripe_failed(string $table, array $row, int $code, string $what): void {
    $id = (int)$row['id'];
    /* A cancellation that will not be applied lets go of its subscription, so
       a later notice can be. */
    $release = $table === 'cancellations' ? ', holds = NULL' : '';
    if (!retryable($code)) {
        q("UPDATE $table SET outcome = 'stripe_refused'$release WHERE id = ?", [$id]);
        alert("refused:$table:$id", "Stripe refused the $what ($table #$id, HTTP $code): do it by hand in the Dashboard.");
        return;
    }
    q("UPDATE $table SET outcome = 'stripe_error', stripe_tries = stripe_tries + 1 WHERE id = ?", [$id]);
    if ((int)$row['stripe_tries'] + 1 >= STRIPE_TRIES) {
        q("UPDATE $table SET outcome = 'stripe_failed'$release WHERE id = ?", [$id]);
        alert("failed:$table:$id", "Stripe did not take the $what ($table #$id) after " . STRIPE_TRIES . ' hourly tries: do it by hand in the Dashboard.');
    }
}

/* ---------- cancellation (section 7) ---------- */

/* What a subscription is, for a cancellation: from Stripe (latest invoice
   expanded) when it answers, else from our own rows. */
function sub_view(?array $s, array $sub): array {
    if ($s) {
        $item = $s['items']['data'][0] ?? [];
        $li = is_array($s['latest_invoice'] ?? null) ? $s['latest_invoice'] : [];
        return ['status' => (string)$s['status'], 'start' => (int)($item['current_period_start'] ?? 0),
                'end' => (int)($item['current_period_end'] ?? 0), 'invoice_status' => (string)($li['status'] ?? 'paid'),
                'paid' => (int)($li['amount_paid'] ?? 0), 'invoice' => $li['id'] ?? null];
    }
    $pay = q('SELECT invoice FROM payments WHERE subscription = ? ORDER BY paid_at DESC LIMIT 1', [$sub['id']])->fetch();
    return ['status' => (string)$sub['status'], 'start' => (int)strtotime((string)$sub['paid_from']),
            'end' => (int)strtotime((string)$sub['paid_until']), 'invoice_status' => 'paid', 'paid' => (int)$sub['amount'],
            'invoice' => $pay['invoice'] ?? null];
}

/* The terms of a cancellation notified on $day: [applied, effective date,
   refund in cents, the invoice refunded]. A renewal not paid
   (failing, or about to be charged) ends the subscription now, so the open
   invoice is never taken. A first-year yearly plan ends with its year whatever
   was asked (CGV 9.3). Otherwise « early » is a date from the day of the notice
   to ten days after, before the paid period ends, with the unused days refunded. */
function cancel_terms(array $v, array $sub, string $choice, ?string $date, string $day): array {
    if (($v['status'] !== 'active' && $v['status'] !== 'trialing') || in_array($v['invoice_status'], ['draft', 'open'], true)) {
        return ['now', $day, 0, null];
    }
    $end = paris_date($v['end']);
    if ($sub['plan'] === 'yearly' && $day < add_months((string)$sub['started'], 12)) return ['year_end', $end, 0, null];
    if ($choice !== 'early' || !$date || $date < $day || $date > add_days($day, EARLY_DAYS) || $date >= $end) {
        return ['period_end', $end, 0, null];
    }
    $from = paris_date($v['start']);
    $days = max(1, days_between($from, $end));
    $unused = max(0, $days - days_between($from, $date) - 1);
    return ['early', $date, intdiv($v['paid'] * $unused, $days), $v['invoice']];
}

/* Apply a recorded cancellation at Stripe; safe to run again. Its terms are set
   once, on the first try, from Stripe's own state (ours when Stripe is out of
   reach, so the acknowledgement can still give a date). Only the notice that
   holds its subscription gets here (cancel.php); a later one is « already ». */
function apply_cancellation(int $id): void {
    $c = row('cancellations', $id);
    if (!$c['subscription'] || !in_array($c['outcome'], ['received', 'stripe_error'], true)) { refund_cancellation($id); return; }
    $sid = (string)$c['subscription'];
    $path = '/v1/subscriptions/' . rawurlencode($sid);
    [$code, $s] = stripe('GET', $path, ['expand' => ['latest_invoice']]);
    $s = $code === 200 ? $s : null;
    if ($s && !in_array($s['status'], LIVE, true)) {
        q('UPDATE cancellations SET outcome = ? WHERE id = ?', [$c['applied'] ? 'scheduled' : 'ended_already', $id]);
        tx(fn() => refresh_sub($sid, null, $s));
        return;
    }
    if (!$c['applied']) {
        $sub = row('subscriptions', $sid);
        [$applied, $eff, $cents, $inv] = cancel_terms(sub_view($s, $sub), $sub, (string)$c['choice'], $c['chosen_date'], paris_date((int)$c['received_at']));
        q('UPDATE cancellations SET applied = ?, effective_date = ?, refund_cents = ?, invoice = ? WHERE id = ?',
          [$applied, $eff, $cents, $inv, $id]);
        $c = row('cancellations', $id);
    }
    if (!$s) { stripe_failed('cancellations', $c, $code, "cancellation of $sid"); return; }
    /* Terms set on an earlier try, from a state Stripe has since left (a new
       period started, perhaps paid, while it was out of reach): nothing is
       replayed blindly; Gabriel decides, with the customer's notice in hand. */
    $item = $s['items']['data'][0] ?? [];
    if ($c['outcome'] === 'stripe_error' && ((int)($item['current_period_start'] ?? 0) > (int)$c['received_at'] ||
        (in_array($c['applied'], ['period_end', 'year_end'], true) && paris_date((int)($item['current_period_end'] ?? 0)) !== $c['effective_date']))) {
        q("UPDATE cancellations SET outcome = 'stripe_refused', holds = NULL WHERE id = ?", [$id]);
        alert('moved:' . $id, "Cancellation #$id of $sid (notified " . date('Y-m-d H:i', (int)$c['received_at']) . ", to end {$c['effective_date']}) " .
            'waited for Stripe while a new period began: apply it by hand, ending the subscription as of that date and refunding any period charged after it.');
        return;
    }
    if ($c['applied'] === 'now' || $c['effective_date'] < today()) {
        [$code, $obj] = stripe('DELETE', $path);
    } elseif ($c['applied'] === 'early') {
        [$code, $obj] = stripe('POST', $path, ['cancel_at' => strtotime($c['effective_date'] . ' 23:59:59'), 'proration_behavior' => 'none'], "cancel:$sid:$id");
    } else {
        [$code, $obj] = stripe('POST', $path, ['cancel_at_period_end' => 'true'], "cancel:$sid:$id");
    }
    if ($code !== 200 || !$obj) { stripe_failed('cancellations', $c, $code, "cancellation of $sid"); return; }
    tx(function () use ($id, $sid, $obj) { q("UPDATE cancellations SET outcome = 'scheduled' WHERE id = ?", [$id]); refresh_sub($sid, null, $obj); });
    refund_cancellation($id);
}

/* The refund an early end promised, once the cancellation is scheduled. */
function refund_cancellation(int $id): void {
    $c = row('cancellations', $id);
    if ($c['outcome'] !== 'scheduled' || (int)$c['refund_cents'] <= 0 || $c['refunded_at'] || (int)$c['stripe_tries'] >= STRIPE_TRIES) return;
    $pay = $c['invoice'] ? row_payment((string)$c['invoice']) : null;
    $code = $pay ? refund($pay, (int)$c['refund_cents'], 'refund:c' . $c['subscription'] . ':' . $id) : 0;   // not recorded yet: later
    if ($code === 200) { q('UPDATE cancellations SET refunded_at = ? WHERE id = ?', [now(), $id]); return; }
    q('UPDATE cancellations SET stripe_tries = stripe_tries + 1 WHERE id = ?', [$id]);
    if (!retryable($code) || (int)$c['stripe_tries'] + 1 >= STRIPE_TRIES) {
        q('UPDATE cancellations SET stripe_tries = ? WHERE id = ?', [STRIPE_TRIES, $id]);
        alert('crefund:' . $id, "The refund of {$c['refund_cents']} cents promised by cancellation #$id ({$c['subscription']}) did not go through (HTTP $code): issue it by hand.");
    }
}

/* ---------- withdrawal (section 7) ---------- */

/* Apply a recorded withdrawal: end the subscription now and refund every
   payment in full. Access closed already, when it was recorded (withdrawn_at).
   Safe to run again. */
function apply_withdrawal(int $id): void {
    $w = row('withdrawals', $id);
    if (!$w['subscription'] || !in_array($w['outcome'], ['received', 'stripe_error'], true)) return;
    $sid = (string)$w['subscription'];
    $path = '/v1/subscriptions/' . rawurlencode($sid);
    [$code, $s] = stripe('GET', $path);
    if ($code === 200 && $s && in_array($s['status'], array_merge(LIVE, ['incomplete']), true)) [$code, $s] = stripe('DELETE', $path);
    if ($code !== 200 || !$s) { stripe_failed('withdrawals', $w, $code, "end of $sid"); return; }
    tx(fn() => refresh_sub($sid, null, $s));
    foreach (q('SELECT * FROM payments WHERE subscription = ? ORDER BY paid_at', [$sid])->fetchAll() as $p) {
        $key = 'refund:w' . $sid . ':' . $id . ':' . $p['invoice'];
        $code = refund($p, (int)$p['amount'] - refunded((string)$p['invoice']), $key);
        if ($code !== 200) { stripe_failed('withdrawals', $w, $code, "refund of {$p['invoice']}"); return; }
    }
    q("UPDATE withdrawals SET outcome = 'done' WHERE id = ?", [$id]);
}

/* Match a typed reference and address to a subscription (cancel, withdraw). */
function match_sub(string $ref, ?string $email): ?array {
    if ($email === null || !preg_match('/^[0-9a-f]{32}$/', $ref)) return null;
    return q('SELECT * FROM subscriptions WHERE order_id = ? AND email = ?', [$ref, $email])->fetch() ?: null;
}

/* An address that matched nothing gets at most NOMATCH_ACKS acknowledgements a
   day, so the forms cannot be used to mail strangers. */
function nomatch_ack_ok(string $email): bool {
    $n = 0;
    foreach (['cancellations', 'withdrawals'] as $t) {
        $n += (int)q("SELECT COUNT(*) FROM $t WHERE email = ? AND subscription IS NULL AND acked = 1 AND received_at > ?", [$email, now() - 86400])->fetchColumn();
    }
    return $n < NOMATCH_ACKS;
}

/* A cancellation from record to acknowledgement: applied at Stripe, then the
   acknowledgement queued once, what it says decided by the outcome. Run by
   cancel.php after its answer, and by the hourly job for any request whose run
   died or whose Stripe step is pending. */
function finish_cancellation(int $id): void {
    apply_cancellation($id);
    $c = row('cancellations', $id);
    if ($c['acked']) return;
    $sub = $c['subscription'] ? row('subscriptions', $c['subscription']) : null;
    if ($c['outcome'] === 'already') {
        $holder = q('SELECT effective_date FROM cancellations WHERE holds = ?', [$c['subscription']])->fetch();
        $c['effective_date'] = $holder['effective_date'] ?? null;
    }
    if ($sub || nomatch_ack_ok((string)$c['email'])) {
        $p = ['ref' => $c['ref'], 'at' => (int)$c['received_at'], 'choice' => $c['choice'], 'date' => $c['chosen_date'], 'matched' => (bool)$sub];
        if ($sub) $p += ['name' => $c['name'], 'motif' => (string)$c['motif'], 'outcome' => $c['outcome'], 'applied' => $c['applied'],
                         'end' => $c['effective_date'], 'refund' => (int)$c['refund_cents']];
        queue('cancel_ack', 'cack:' . $id, (string)$c['email'], (string)$c['lang'], $sub ? (string)$sub['order_id'] : 'c:' . $id, $p);
    }
    q('UPDATE cancellations SET acked = 1 WHERE id = ?', [$id]);
    if (!$sub) alert('nomatch:c' . $id, "Cancellation #$id from {$c['email']} (reference {$c['ref']}) matched no subscription: check whether it is a customer's.");
    if ($sub && (string)$c['motif'] !== '') {
        alert('motif:' . $id, "Cancellation #$id of {$sub['id']} ({$sub['plan']}, {$c['email']}, outcome {$c['outcome']}) states a reason; decide whether it is a « motif légitime »:\n\n{$c['motif']}");
    }
}

/* The same for a withdrawal. */
function finish_withdrawal(int $id): void {
    apply_withdrawal($id);
    $w = row('withdrawals', $id);
    if ($w['acked']) return;
    $sub = $w['subscription'] ? row('subscriptions', $w['subscription']) : null;
    if ($sub || nomatch_ack_ok((string)$w['email'])) {
        $p = ['ref' => $w['ref'], 'at' => (int)$w['received_at'], 'matched' => (bool)$sub];
        if ($sub) $p += ['name' => $w['name'], 'outcome' => $w['outcome'], 'refund' => (int)$w['refund_cents'],
                         'deadline' => withdraw_deadline((string)$sub['started'])];
        queue('withdraw_ack', 'wack:' . $id, (string)$w['email'], (string)$w['lang'], $sub ? (string)$sub['order_id'] : 'w:' . $id, $p);
    }
    q('UPDATE withdrawals SET acked = 1 WHERE id = ?', [$id]);
    if (!$sub) alert('nomatch:w' . $id, "Withdrawal #$id from {$w['email']} (reference {$w['ref']}) matched no subscription: a clear statement of withdrawal still counts (L221-21), so check whether it is a customer's.");
    if ($sub && $w['outcome'] === 'out_of_time') alert('late:' . $id, "Withdrawal #$id for {$sub['id']} came after the deadline (" . withdraw_deadline((string)$sub['started']) . '): acknowledged as out of time.');
    if ($sub && $w['outcome'] !== 'out_of_time' && q("SELECT COUNT(*) FROM withdrawals WHERE email = ? AND id < ? AND subscription IS NOT NULL
            AND outcome <> 'out_of_time' AND received_at > ?", [$w['email'], $id, now() - 365 * 86400])->fetchColumn() > 0) {
        alert('repeat:' . $id, "{$w['email']} withdrew again within a year (withdrawal #$id): subscribe, use, withdraw may be a loop.");
    }
}

/* ---------- the hourly job's payment steps (section 5) ---------- */

/* The yearly renewal notice (section 8): queued on the first day of its window,
   once per deadline; a window that closes with no notice sent marks the
   subscription notice_missed and tells Gabriel, once per deadline. */
function renewal_notices(): void {
    $day = today();
    foreach (q("SELECT * FROM subscriptions WHERE plan = 'yearly' AND status = 'active' AND cancel_at IS NULL AND withdrawn_at IS NULL
                AND paid_until IS NOT NULL")->fetchAll() as $s) {
        $deadline = add_days((string)$s['paid_until'], -1);
        if ($s['notice_deadline'] === $deadline && $s['notice_sent_at']) continue;
        $from = add_months($deadline, -3); $to = add_days(add_months($deadline, -1), -2);
        if ($day >= $from && $day <= $to) {
            if ($s['notice_deadline'] === $deadline) continue;            // queued, on its way
            $o = row('orders', $s['order_id']);
            tx(function () use ($s, $deadline, $o) {
                q('UPDATE subscriptions SET notice_deadline = ?, notice_sent_at = NULL WHERE id = ?', [$deadline, $s['id']]);
                queue('notice', 'notice:' . $s['id'] . ':' . $deadline, (string)$s['email'], (string)($o['lang'] ?? 'fr'), (string)$s['order_id'],
                    ['sub' => $s['id'], 'deadline' => $deadline, 'renews' => $s['paid_until'], 'cents' => PLANS['yearly']['cents'], 'ref' => $s['order_id']]);
            });
        } elseif ($day > $to) {
            q('UPDATE subscriptions SET notice_missed = 1 WHERE id = ?', [$s['id']]);
            alert('missed:' . $s['id'] . ':' . $deadline, "No renewal notice went to {$s['email']} ({$s['id']}) by $to: " .
                'after the renewal they may end at any time with the unused days refunded (CGV 8.2).');
        }
    }
}

/* Requests left unfinished: a run that died after its answer, a Stripe step to
   retry, a refund pending. Ten minutes old at least, so a request still being
   finished by its own endpoint is left alone. */
function pending_stripe_calls(float $deadline): void {
    $start = microtime(true);
    $jobs = [   // withdrawals first: their refunds have a legal deadline
        ['withdrawals', 'finish_withdrawal', "(acked = 0 OR outcome IN ('received', 'stripe_error'))"],
        ['cancellations', 'finish_cancellation', "(acked = 0 OR outcome IN ('received', 'stripe_error') OR
            (outcome = 'scheduled' AND refund_cents > 0 AND refunded_at IS NULL AND stripe_tries < " . STRIPE_TRIES . '))'],
    ];
    foreach ($jobs as $n => [$table, $finish, $where]) {
        $until = $n === 0 ? $start + ($deadline - $start) / 2 : $deadline;
        foreach (q("SELECT id FROM $table WHERE received_at < ? AND $where ORDER BY id LIMIT 20", [now() - 600])->fetchAll(PDO::FETCH_COLUMN) as $id) {
            if (microtime(true) > $until) break;
            /* One request that throws must not hold up the others, every hour. */
            try { $finish((int)$id); } catch (Throwable $e) { log_php("$finish #$id: " . describe($e)); }
        }
    }
}

/* What the payment tables keep (section 3): pending orders 30 days (beyond
   Stripe's 3 days of webhook retries), ordinary mails 30 days after sending
   (one never sent stays until someone deals with it); an order and everything about it five years after its subscription
   ended, a request that matched nothing five years; payments and refunds ten
   years. */
function purge_payments(): void {
    $n = now(); $five = $n - 5 * 365 * 86400; $ten = $n - 10 * 365 * 86400;
    q("DELETE FROM orders WHERE status = 'pending' AND created < ? AND id NOT IN (SELECT order_id FROM subscriptions)", [$n - 30 * 86400]);
    q("DELETE FROM outbox WHERE kind IN ('already', 'failed', 'alert') AND sent_at < ?", [$n - 30 * 86400]);
    foreach (q('SELECT id, order_id FROM subscriptions WHERE ended_at IS NOT NULL AND ended_at < ?', [$five])->fetchAll() as $s) {
        tx(function () use ($s) {
            foreach (['cancellations', 'withdrawals'] as $t) q("DELETE FROM $t WHERE subscription = ?", [$s['id']]);
            q('DELETE FROM outbox WHERE ref = ?', [$s['order_id']]);
            q('DELETE FROM subscriptions WHERE id = ?', [$s['id']]);
            q('DELETE FROM orders WHERE id = ?', [$s['order_id']]);
        });
    }
    foreach (['cancellations' => 'c:', 'withdrawals' => 'w:'] as $t => $p) {
        foreach (q("SELECT id FROM $t WHERE subscription IS NULL AND received_at < ?", [$five])->fetchAll(PDO::FETCH_COLUMN) as $id) {
            tx(function () use ($t, $p, $id) { q('DELETE FROM outbox WHERE ref = ?', [$p . $id]); q("DELETE FROM $t WHERE id = ?", [$id]); });
        }
    }
    q('DELETE FROM refunds WHERE invoice IN (SELECT invoice FROM payments WHERE paid_at < ?)', [$ten]);
    q('DELETE FROM payments WHERE paid_at < ?', [$ten]);
}
