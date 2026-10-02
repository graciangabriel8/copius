<?php
/* POST {name, email, ref, lang}: « Renoncer au contrat ici » (DESIGN-PAYMENT.md
   section 7, CGV article 7). Recorded first; within the 14 days the
   subscription ends now, access closes and every payment is refunded in full.
   The acknowledgement goes to the typed address in every case. */
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
if ($name === '' || mb_strlen($name) > 200 || !mb_check_encoding($name, 'UTF-8') || $addr === null ||
    $ref === '' || strlen($ref) > 64 || !preg_match('/^[\x21-\x7e]+$/', $ref)) {
    json_out(400); log_api('invalid'); exit;
}

$sub = match_sub($ref, $addr);
$late = $sub && today() > withdraw_deadline((string)$sub['started']);
$id = tx(function () use ($name, $addr, $ref, $sub, $late) {
    q('INSERT INTO withdrawals (received_at, name, email, ref, subscription, outcome) VALUES (?, ?, ?, ?, ?, ?)',
      [now(), $name, $addr, $ref, $sub['id'] ?? null, !$sub ? 'no_match' : ($late ? 'out_of_time' : 'received')]);
    return (int)db()->lastInsertId();
});
json_out(200, ['ok' => true]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

if ($sub && !$late) apply_withdrawal($id);
if ($late) alert('late:' . $id, "Withdrawal #$id for {$sub['id']} came after the deadline (" . withdraw_deadline((string)$sub['started']) . '): acknowledged as out of time.');
$w = q('SELECT * FROM withdrawals WHERE id = ?', [$id])->fetch();
queue('withdraw_ack', 'wack:' . $id, $addr, $lang, $sub ? (string)$sub['order_id'] : null, [
    'name' => $name, 'ref' => $ref, 'at' => (int)$w['received_at'], 'matched' => (bool)$sub, 'outcome' => $w['outcome'],
    'refund' => $sub ? (int)q('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE subscription = ?', [$sub['id']])->fetchColumn() : 0,
    'deadline' => $sub ? withdraw_deadline((string)$sub['started']) : null,
]);
log_api('withdraw_' . $w['outcome']);
send_outbox(5, $T0 + 140, $sub ? (string)$sub['order_id'] : null);
