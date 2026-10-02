<?php
/* POST {name, email, ref, choice, date?, motif?, lang}: the « Résilier votre
   contrat » function (DESIGN-PAYMENT.md section 7, CGV article 9). The
   notification is recorded before anything else; the answer is the same
   whether or not it matches a subscription; the acknowledgement goes to the
   typed address in every case. Works whether or not sales are open. */
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
$choice = in_array($in['choice'] ?? '', ['period_end', 'early'], true) ? $in['choice'] : 'period_end';
$date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['date'] ?? '')) ? $in['date'] : null;
$motif = trim((string)($in['motif'] ?? ''));
$lang = ($in['lang'] ?? '') === 'en' ? 'en' : 'fr';
if ($name === '' || mb_strlen($name) > 200 || !mb_check_encoding($name, 'UTF-8') || $addr === null ||
    $ref === '' || strlen($ref) > 64 || !preg_match('/^[\x21-\x7e]+$/', $ref) ||
    mb_strlen($motif) > 2000 || !mb_check_encoding($motif, 'UTF-8')) {
    json_out(400); log_api('invalid'); exit;
}

$sub = match_sub($ref, $addr);
$id = tx(function () use ($name, $addr, $ref, $choice, $date, $motif, $sub) {
    q('INSERT INTO cancellations (received_at, name, email, ref, choice, chosen_date, motif, subscription, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [now(), $name, $addr, $ref, $choice, $date, $motif === '' ? null : $motif, $sub['id'] ?? null, $sub ? 'received' : 'no_match']);
    return (int)db()->lastInsertId();
});
json_out(200, ['ok' => true]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

if ($sub) {
    if (!in_array($sub['status'], ['active', 'trialing', 'past_due'], true)) {
        q("UPDATE cancellations SET outcome = 'ended_already' WHERE id = ?", [$id]);
    } else {
        apply_cancellation($id);
    }
}
$c = q('SELECT * FROM cancellations WHERE id = ?', [$id])->fetch();
if ($c['applied'] === 'year_end' && $motif !== '') {
    alert('motif:' . $id, "Cancellation #$id of a first-year yearly plan ({$sub['id']}) states a reason; decide whether it is a « motif légitime »:\n\n$motif");
}
queue('cancel_ack', 'cack:' . $id, $addr, $lang, $sub ? (string)$sub['order_id'] : null, [
    'name' => $name, 'ref' => $ref, 'at' => (int)$c['received_at'], 'choice' => $choice, 'date' => $date,
    'matched' => (bool)$sub, 'outcome' => $c['outcome'], 'applied' => $c['applied'], 'end' => $c['effective_date'],
    'refund' => (int)$c['refund_cents'], 'motif' => $motif,
]);
log_api('cancel_' . $c['outcome']);
send_outbox(5, $T0 + 140, $sub ? (string)$sub['order_id'] : null);
