<?php
/* Copius payments: what order, the webhook, cancel, withdraw and the hourly job
   share. The design is DESIGN-PAYMENT.md (kairos/copius-step2); section numbers
   below refer to it. Included after _lib.php and _mail.php. */
declare(strict_types=1);
require_once __DIR__ . '/_paymail.php';

/* The two plans of the CGV (article 4.1). The price ids live in config.php; the
   amounts here are what the pages and the mails show, and refunds are computed
   from what was actually paid. */
const PLANS = [
    'monthly' => ['cents' => 490, 'months' => 1],
    'yearly'  => ['cents' => 3900, 'months' => 12],
];
const RETRY_DAYS = 7;          // a failed renewal keeps access this long (CGV 4.4)
const EARLY_DAYS = 10;         // a cancellation takes effect at most this far ahead (CGV 9.2)
const WITHDRAW_DAYS = 14;      // CGV 7.1
const OUTBOX_TRIES = 24;       // one a run, hourly: a day, then an alert
const STRIPE_TRIES = 24;

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
    if ($code !== 200) log_php("stripe $method " . preg_replace('#/(sub|in|pi|cs)_[A-Za-z0-9]+#', '/$1_…', $path) .
        " $code " . (is_array($out) ? substr((string)($out['error']['code'] ?? $out['error']['type'] ?? ''), 0, 60) : ''));
    return [$code, is_array($out) ? $out : null];
}

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
function add_months(string $d, int $n): string { return date('Y-m-d', strtotime("$d +$n month")); }

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

/* ---------- transactions ---------- */

/* One transaction, committed or rolled back. On MySQL in READ COMMITTED, so a
   locking read sees what other events committed, and the grant row is locked
   with FOR UPDATE (section 2); SQLite, the rig's, serialises writers itself. */
function tx(callable $f) {
    $pdo = db();
    static $set = null;
    if ($set !== $pdo && $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
        $set = $pdo;
    }
    $pdo->beginTransaction();
    try { $r = $f(); $pdo->commit(); return $r; }
    catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function for_update(): string { return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : ''; }

/* ---------- access (section 2) ---------- */

/* The date a subscription is good for, or null when it no longer counts. */
function sub_until(array $s): ?string {
    if (!in_array($s['status'], ['active', 'trialing', 'past_due'], true) || !$s['paid_until']) return null;
    $u = (string)$s['paid_until'];
    if ($s['status'] === 'past_due' && $s['retry_until'] && $s['retry_until'] > $u) $u = (string)$s['retry_until'];
    if ($s['cancel_at']) $u = min($u, paris_date((int)$s['cancel_at']));
    return $u;
}

/* The address's grant row, from all its Copius subscriptions. An open manual
   grant (a tester, a school) is never touched; a dated manual one is only ever
   lengthened; a 'stripe' row follows the subscriptions, and closes (yesterday's
   date) when none counts. A subscription counts only once its confirmation is
   sent (orders.confirmed_at): access never opens before it (L221-13). Called
   inside the event's transaction. */
function sync_grant(string $email): void {
    $rows = q('SELECT email, until, note FROM grants WHERE LOWER(TRIM(email)) = ?' . for_update(), [$email])->fetchAll();
    foreach ($rows as $r) if ($r['until'] === null || $r['until'] === '' || $r['until'] === '0000-00-00') return;
    $target = null;
    foreach (q('SELECT s.* FROM subscriptions s JOIN orders o ON o.id = s.order_id
                WHERE s.email = ? AND o.confirmed_at IS NOT NULL' . for_update(), [$email])->fetchAll() as $s) {
        $u = sub_until($s);
        if ($u !== null && ($target === null || $u > $target)) $target = $u;
    }
    $own = null;
    foreach ($rows as $r) if ($r['email'] === $email) $own = $r;
    if ($own === null) {
        if ($target !== null) q("INSERT INTO grants (email, note, until) VALUES (?, 'stripe', ?)", [$email, $target]);
        return;
    }
    if ($own['note'] === 'stripe') {
        q('UPDATE grants SET until = ? WHERE email = ?', [$target ?? add_days(today(), -1), $email]);
    } elseif ($target !== null && $target > (string)$own['until']) {
        q('UPDATE grants SET until = ? WHERE email = ?', [$target, $email]);
    } elseif ($target === null && (string)$own['until'] >= today()) {
        alert('manual:' . $email . ':' . today(), "A paid subscription of $email ended, but its grant row is a manual one dated " .
            $own['until'] . ": access stays open until then unless you change the row.");
    }
}

/* ---------- subscriptions ---------- */

/* The order a Stripe object carries in its metadata, if it is one of Copius's. */
function our_order(?array $meta): ?array {
    $id = is_array($meta) ? (string)($meta['order'] ?? '') : '';
    if (!preg_match('/^[0-9a-f]{32}$/', $id)) return null;
    return q('SELECT * FROM orders WHERE id = ?', [$id])->fetch() ?: null;
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
    $row = q('SELECT * FROM subscriptions WHERE id = ?' . for_update(), [$id])->fetch();
    if (!$row) {
        q('INSERT INTO subscriptions (id, order_id, email, plan, status) VALUES (?, ?, ?, ?, ?)',
          [$id, $order['id'], $order['email'], $order['plan'], 'incomplete']);
    }
    $cancel = $obj['cancel_at'] ?? null;
    if (!$cancel && !empty($obj['cancel_at_period_end'])) $cancel = $obj['items']['data'][0]['current_period_end'] ?? null;
    q('UPDATE subscriptions SET status = ?, cancel_at = ?, ended_at = ? WHERE id = ?',
      [(string)$obj['status'], $cancel ? (int)$cancel : null, isset($obj['ended_at']) ? (int)$obj['ended_at'] : null, $id]);
    return q('SELECT * FROM subscriptions WHERE id = ?', [$id])->fetch();
}

/* ---------- the outbox (section 5) ---------- */

/* Queue one mail; a second row with the same dedupe key is a no-op. */
function queue(string $kind, string $dedupe, string $to, string $lang, ?string $ref, array $payload): void {
    try {
        q('INSERT INTO outbox (kind, dedupe, to_addr, lang, ref, payload, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [$kind, $dedupe, $to, $lang === 'en' ? 'en' : 'fr', $ref, json_encode($payload, JSON_UNESCAPED_UNICODE), now()]);
    } catch (PDOException $e) {
        if ($e->getCode() !== '23000') throw $e;
    }
}

function alert(string $dedupe, string $text): void {
    queue('alert', 'alert:' . $dedupe, (string)(cfg('alert_to') ?? 'contact@copius.fr'), 'en', null, ['text' => $text]);
}

/* Send what is due, oldest first: each row claimed atomically, one SMTP try per
   row and run (the next run retries; a claim outlives its attempt only when the
   run dies, for 10 minutes), the row's effect applied only once its mail is sent. $only limits the run to rows for one reference (the webhook's
   own). Returns how many were sent. */
function send_outbox(int $limit, float $deadline, ?string $only = null): int {
    $sql = 'SELECT id FROM outbox WHERE sent_at IS NULL AND attempts < ? AND (claimed_at IS NULL OR claimed_at < ?)';
    $args = [OUTBOX_TRIES, now() - 600];
    if ($only !== null) { $sql .= ' AND ref = ?'; $args[] = $only; }
    $sent = 0;
    foreach (q($sql . ' ORDER BY id LIMIT ' . (int)$limit, $args)->fetchAll(PDO::FETCH_COLUMN) as $id) {
        if (microtime(true) > $deadline - 15) break;
        if (q('UPDATE outbox SET claimed_at = ?, attempts = attempts + 1 WHERE id = ? AND sent_at IS NULL AND
               (claimed_at IS NULL OR claimed_at < ?)', [now(), $id, now() - 600])->rowCount() !== 1) continue;
        $row = q('SELECT * FROM outbox WHERE id = ?', [$id])->fetch();
        $m = pay_mail($row);
        $err = $m === null ? 'build' : deliver($m, $deadline);
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
                sync_grant((string)$row['to_addr']);
            } elseif ($row['kind'] === 'notice') {
                q('UPDATE subscriptions SET notice_sent_at = ? WHERE id = ? AND notice_deadline = ?',
                  [now(), $p['sub'], $p['deadline']]);
            }
        });
        $sent++;
    }
    return $sent;
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

/* ---------- refunds and cancellation at Stripe (section 7) ---------- */

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

/* Refund part of one payment. True once Stripe has taken it (or it was taken
   before under the same key); the payment row records what Copius refunded. */
function refund(array $pay, int $cents, string $key): bool {
    if ($cents <= 0) return true;
    $pi = $pay['payment_intent'];
    if (!$pi) return false;
    [$code] = stripe('POST', '/v1/refunds', ['payment_intent' => $pi, 'amount' => $cents, 'reason' => 'requested_by_customer',
        'metadata' => ['copius' => $key]], $key);
    if ($code !== 200) return false;
    q('UPDATE payments SET refunded = refunded + ? WHERE invoice = ?', [$cents, $pay['invoice']]);
    return true;
}

/* What a cancellation notified on $day means for this subscription: the
   choice as applied, its effective date, the refund. A first-year yearly plan
   ends with its year whatever was asked (CGV 9.3); otherwise "early" is a date
   from the day of the notice to ten days after, before the paid period ends. */
function cancel_terms(array $sub, string $choice, ?string $date, string $day): array {
    $year_one = $sub['plan'] === 'yearly' && $day < add_months((string)$sub['started'], 12);
    $end = (string)$sub['paid_until'];
    if ($year_one) return ['year_end', $end, 0];
    if ($choice !== 'early' || !$date || $date < $day || $date > add_days($day, EARLY_DAYS) || $date >= $end) {
        return ['period_end', $end, 0];
    }
    $days = max(1, days_between((string)$sub['paid_from'], $end));
    $unused = max(0, $days - days_between((string)$sub['paid_from'], $date) - 1);
    return ['early', $date, intdiv((int)$sub['amount'] * $unused, $days)];
}

/* Apply a recorded cancellation at Stripe; safe to run again (the hourly job
   does, for a stripe_error). Its outcome and the acknowledgement are written
   here, the mail sent by the outbox. */
function apply_cancellation(int $id): void {
    $c = q('SELECT * FROM cancellations WHERE id = ?', [$id])->fetch();
    $sub = $c['subscription'] ? q('SELECT * FROM subscriptions WHERE id = ?', [$c['subscription']])->fetch() : null;
    if (!$sub) return;
    $day = paris_date((int)$c['received_at']);
    if (!$c['applied']) {
        [$applied, $eff, $cents] = cancel_terms($sub, (string)$c['choice'], $c['chosen_date'], $day);
        q('UPDATE cancellations SET applied = ?, effective_date = ?, refund_cents = ? WHERE id = ?', [$applied, $eff, $cents, $id]);
        $c = q('SELECT * FROM cancellations WHERE id = ?', [$id])->fetch();
    }
    if (in_array($c['outcome'], ['received', 'stripe_error'], true)) {
        $form = $c['applied'] === 'early'
            ? ['cancel_at' => strtotime($c['effective_date'] . ' 23:59:59'), 'proration_behavior' => 'none']
            : ['cancel_at_period_end' => 'true'];
        [$code, $obj] = stripe('POST', '/v1/subscriptions/' . rawurlencode((string)$sub['id']), $form, 'cancel:' . $id);
        if ($code === 200 && $obj) {
            tx(function () use ($id, $sub, $obj) {
                q("UPDATE cancellations SET outcome = 'scheduled' WHERE id = ?", [$id]);
                refresh_sub((string)$sub['id'], null, $obj);
                sync_grant((string)$sub['email']);
            });
        } elseif ($code >= 400 && $code < 500) {
            $ended = !in_array($sub['status'], ['active', 'trialing', 'past_due'], true);
            q('UPDATE cancellations SET outcome = ? WHERE id = ?', [$ended ? 'ended_already' : 'stripe_refused', $id]);
            if (!$ended) alert('cancel:' . $id, "Stripe refused cancellation #$id ($code) of {$sub['id']}: do it by hand.");
        } else {
            q("UPDATE cancellations SET outcome = 'stripe_error', stripe_tries = stripe_tries + 1 WHERE id = ?", [$id]);
            if ((int)$c['stripe_tries'] + 1 === STRIPE_TRIES) alert('cancel:' . $id, "Cancellation #$id of {$sub['id']} still not taken by Stripe after " . STRIPE_TRIES . ' tries.');
        }
        $c = q('SELECT * FROM cancellations WHERE id = ?', [$id])->fetch();
    }
    if ($c['outcome'] === 'scheduled' && (int)$c['refund_cents'] > 0 && !$c['refunded_at']) {
        $pay = q('SELECT * FROM payments WHERE subscription = ? ORDER BY paid_at DESC LIMIT 1', [$sub['id']])->fetch();
        if ($pay && refund($pay, (int)$c['refund_cents'], 'refund:c' . $id)) {
            q('UPDATE cancellations SET refunded_at = ? WHERE id = ?', [now(), $id]);
        } elseif ((int)$c['stripe_tries'] + 1 === STRIPE_TRIES) {
            alert('crefund:' . $id, "Refund of {$c['refund_cents']} cents for cancellation #$id still failing.");
        } else {
            q('UPDATE cancellations SET stripe_tries = stripe_tries + 1 WHERE id = ?', [$id]);
        }
    }
}

/* Apply a recorded withdrawal: end the subscription now, close access, refund
   every payment in full. Safe to run again. */
function apply_withdrawal(int $id): void {
    $w = q('SELECT * FROM withdrawals WHERE id = ?', [$id])->fetch();
    $sub = $w['subscription'] ? q('SELECT * FROM subscriptions WHERE id = ?', [$w['subscription']])->fetch() : null;
    if (!$sub || !in_array($w['outcome'], ['received', 'stripe_error'], true)) return;
    $ok = true;
    if (in_array($sub['status'], ['active', 'trialing', 'past_due', 'incomplete'], true)) {
        [$code, $obj] = stripe('DELETE', '/v1/subscriptions/' . rawurlencode((string)$sub['id']));
        /* Refused because a first try already ended it: read it back. */
        if ($code >= 400 && $code < 500) { [$code, $obj] = stripe('GET', '/v1/subscriptions/' . rawurlencode((string)$sub['id'])); }
        if ($code === 200 && $obj && $obj['status'] === 'canceled') {
            tx(function () use ($sub, $obj) { refresh_sub((string)$sub['id'], null, $obj); sync_grant((string)$sub['email']); });
        } else {
            $ok = false;
        }
    }
    $total = 0;
    foreach (q('SELECT * FROM payments WHERE subscription = ?', [$sub['id']])->fetchAll() as $p) {
        $left = (int)$p['amount'] - (int)$p['refunded'];
        if ($left > 0 && refund($p, $left, 'refund:w' . $id . ':' . $p['invoice'])) $total += $left;
        elseif ($left > 0) $ok = false;
    }
    q('UPDATE withdrawals SET refund_cents = refund_cents + ? WHERE id = ?', [$total, $id]);
    if ($ok) { q("UPDATE withdrawals SET outcome = 'done' WHERE id = ?", [$id]); return; }
    q("UPDATE withdrawals SET outcome = 'stripe_error', stripe_tries = stripe_tries + 1 WHERE id = ?", [$id]);
    if ((int)$w['stripe_tries'] + 1 === STRIPE_TRIES) alert('withdraw:' . $id, "Withdrawal #$id of {$sub['id']} still not done at Stripe after " . STRIPE_TRIES . ' tries.');
}

/* Match a typed reference and address to a subscription (cancel, withdraw). */
function match_sub(string $ref, ?string $email): ?array {
    if ($email === null || !preg_match('/^[0-9a-f]{32}$/', $ref)) return null;
    return q('SELECT * FROM subscriptions WHERE order_id = ? AND email = ?', [$ref, $email])->fetch() ?: null;
}

/* ---------- the hourly job's payment steps (section 5) ---------- */

/* The yearly renewal notice (section 8): queued on the first day of its window,
   once per deadline; past the window with none sent, the subscription is marked
   notice_missed and Gabriel is told. */
function renewal_notices(): void {
    $day = today();
    foreach (q("SELECT * FROM subscriptions WHERE plan = 'yearly' AND status = 'active' AND cancel_at IS NULL AND paid_until IS NOT NULL")->fetchAll() as $s) {
        $deadline = add_days((string)$s['paid_until'], -1);
        $from = add_months($deadline, -3); $to = add_days(add_months($deadline, -1), -2);
        $sent = $s['notice_deadline'] === $deadline && $s['notice_sent_at'];
        if ($sent) continue;
        if ($day >= $from && $day <= $to) {
            $o = q('SELECT lang FROM orders WHERE id = ?', [$s['order_id']])->fetch();
            tx(function () use ($s, $deadline, $o) {
                q('UPDATE subscriptions SET notice_deadline = ? WHERE id = ?', [$deadline, $s['id']]);
                queue('notice', 'notice:' . $s['id'] . ':' . $deadline, (string)$s['email'], (string)($o['lang'] ?? 'fr'), (string)$s['order_id'],
                    ['sub' => $s['id'], 'deadline' => $deadline, 'renews' => $s['paid_until'], 'cents' => PLANS['yearly']['cents'], 'ref' => $s['order_id']]);
            });
        } elseif ($day > $to && !$s['notice_missed']) {
            q('UPDATE subscriptions SET notice_missed = 1 WHERE id = ?', [$s['id']]);
            alert('missed:' . $s['id'] . ':' . $deadline, "No renewal notice went to {$s['email']} ({$s['id']}) before $to: " .
                'after the renewal they may end at any time with the unused days refunded (CGV 8.2).');
        }
    }
}

function pending_stripe_calls(): void {
    foreach (q("SELECT id FROM cancellations WHERE outcome = 'stripe_error' OR (outcome = 'scheduled' AND refund_cents > 0 AND refunded_at IS NULL)")
             ->fetchAll(PDO::FETCH_COLUMN) as $id) apply_cancellation((int)$id);
    foreach (q("SELECT id FROM withdrawals WHERE outcome = 'stripe_error'")->fetchAll(PDO::FETCH_COLUMN) as $id) apply_withdrawal((int)$id);
}

/* What the payment tables keep (section 3): pending orders 2 days, event ids
   30 days, ordinary mails 30 days after sending; an order and everything about
   it five years after its subscription ended; payments ten years. */
function purge_payments(): void {
    $n = now();
    q("DELETE FROM orders WHERE status = 'pending' AND created < ? AND id NOT IN (SELECT order_id FROM subscriptions)", [$n - 2 * 86400]);
    q('DELETE FROM processed_events WHERE at < ?', [$n - 30 * 86400]);
    q("DELETE FROM outbox WHERE sent_at < ? AND kind NOT IN ('confirm', 'notice', 'cancel_ack', 'withdraw_ack')", [$n - 30 * 86400]);
    foreach (q('SELECT id, order_id FROM subscriptions WHERE ended_at IS NOT NULL AND ended_at < ?', [$n - 5 * 365 * 86400])->fetchAll() as $s) {
        tx(function () use ($s) {
            foreach (['cancellations', 'withdrawals'] as $t) q("DELETE FROM $t WHERE ref = ?", [$s['order_id']]);
            q('DELETE FROM outbox WHERE ref = ?', [$s['order_id']]);
            q('DELETE FROM subscriptions WHERE id = ?', [$s['id']]);
            q('DELETE FROM orders WHERE id = ?', [$s['order_id']]);
        });
    }
    foreach (['cancellations', 'withdrawals'] as $t) {
        q("DELETE FROM $t WHERE received_at < ? AND ref NOT IN (SELECT id FROM orders)", [$n - 5 * 365 * 86400]);
    }
    q('DELETE FROM payments WHERE paid_at < ?', [$n - 10 * 365 * 86400]);
}
