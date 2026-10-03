<?php
/* POST {name, email, ref, choice, date?, motif?, lang}: the « Résilier votre
   contrat » function (DESIGN-PAYMENT.md section 7, CGV article 9). The
   notification is recorded before anything else; the answer is the same
   whether or not it matches a subscription; the acknowledgement goes to the
   typed address (one that matched nothing gets a short one, at most three a
   day). Works whether or not sales are open. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_mail.php';
require __DIR__ . '/_pay.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$in = json_input();
if ($in === null) { log_api('refused'); exit; }
$ip = rk('c:' . ip_key());
if (cfg('per_ip_limits')) {
    if (!under($ip, 10, 50)) { json_out(429); log_api('ip_limit'); exit; }
    hit($ip);
}

$name = trim((string)($in['name'] ?? ''));
$addr = normal_address((string)($in['email'] ?? ''));
$ref = strtolower(trim((string)($in['ref'] ?? '')));
$choice = in_array($in['choice'] ?? '', ['period_end', 'early'], true) ? $in['choice'] : null;
$date = $in['date'] ?? null;
$motif = trim((string)($in['motif'] ?? ''));
$lang = ($in['lang'] ?? '') === 'en' ? 'en' : 'fr';
$date_ok = $date === null || (is_string($date) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $d) && checkdate((int)$d[2], (int)$d[3], (int)$d[1]));
if ($name === '' || mb_strlen($name) > 200 || !mb_check_encoding($name, 'UTF-8') || $addr === null ||
    !preg_match('/^[0-9a-f]{32}$/', $ref) || $choice === null || !$date_ok ||
    mb_strlen($motif) > 2000 || !mb_check_encoding($motif, 'UTF-8')) {
    json_out(400); log_api('invalid'); exit;
}
/* Per address, whatever the IP: a cancellation is not something one sends often. */
$per = rk('cw:' . $addr);
if (!under($per, 3, 5)) { json_out(429); log_api('address_limit'); exit; }
hit($per);

$sub = match_sub($ref, $addr);
$at = now();
$id = tx(function () use ($at, $name, $addr, $ref, $lang, $choice, $date, $motif, $sub) {
    q('INSERT INTO cancellations (received_at, name, email, ref, lang, choice, chosen_date, motif, subscription, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [$at, $name, $addr, $ref, $lang, $choice, $date, $motif === '' ? null : $motif, $sub['id'] ?? null, $sub ? 'received' : 'no_match']);
    return (int)db()->lastInsertId();
});
json_out(200, ['ok' => true, 'at' => $at]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

finish_cancellation($id);
log_api('cancel_' . row('cancellations', $id)['outcome']);
send_outbox(5, $T0 + 140, $sub ? (string)$sub['order_id'] : 'c:' . $id);
