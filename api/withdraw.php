<?php
/* POST {name, email, ref, lang}: « Renoncer au contrat ici » (DESIGN-PAYMENT.md
   section 7, CGV article 7). Recorded first; within the 14 days access closes
   at once (withdrawn_at), then the subscription ends and every payment is
   refunded in full. The acknowledgement goes to the typed address (one that
   matched nothing gets a short one, at most three a day). */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_mail.php';
require __DIR__ . '/_pay.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$in = json_input();
if ($in === null) { log_api('refused'); exit; }
$ip = rk('w:' . ip_key());
if (cfg('per_ip_limits')) {
    if (!under($ip, 10, 50)) { json_out(429); log_api('ip_limit'); exit; }
    hit($ip);
}

$name = trim((string)($in['name'] ?? ''));
$addr = normal_address((string)($in['email'] ?? ''));
$ref = strtolower(trim((string)($in['ref'] ?? '')));
$lang = ($in['lang'] ?? '') === 'en' ? 'en' : 'fr';
if ($name === '' || mb_strlen($name) > 200 || !mb_check_encoding($name, 'UTF-8') || $addr === null || !preg_match('/^[0-9a-f]{32}$/', $ref)) {
    json_out(400); log_api('invalid'); exit;
}
$per = rk('cw:' . $addr . '|i:' . ip_key());
if (!under($per, 3, 5)) { json_out(429); log_api('address_limit'); exit; }
hit($per);

$sub = match_sub($ref, $addr);
$late = $sub && today() > withdraw_deadline((string)$sub['started']);
$at = now();
$id = tx(function () use ($at, $name, $addr, $ref, $lang, $sub, $late) {
    /* What this withdrawal refunds: every payment, less what was refunded before. */
    $left = 0;
    if ($sub && !$late) {
        foreach (q('SELECT invoice, amount FROM payments WHERE subscription = ?', [$sub['id']])->fetchAll() as $p) {
            $left += max(0, (int)$p['amount'] - refunded((string)$p['invoice']));
        }
        q('UPDATE subscriptions SET withdrawn_at = ? WHERE id = ? AND withdrawn_at IS NULL', [$at, $sub['id']]);
    }
    q('INSERT INTO withdrawals (received_at, name, email, ref, lang, subscription, outcome, refund_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [$at, $name, $addr, $ref, $lang, $sub['id'] ?? null, !$sub ? 'no_match' : ($late ? 'out_of_time' : 'received'), $left]);
    return (int)db()->lastInsertId();
});
json_out(200, ['ok' => true, 'at' => $at]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

finish_withdrawal($id);
log_api('withdraw_' . row('withdrawals', $id)['outcome']);
send_outbox(5, $T0 + 140, $sub ? (string)$sub['order_id'] : 'w:' . $id);
