<?php
/* POST {email, plan, cgv: true, lang}: the order, then a Stripe Checkout
   Session made for it, server-side (DESIGN-PAYMENT.md section 1). Answers
   {url} to go and pay, or {mailed: true} when the address already subscribes. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_mail.php';
require __DIR__ . '/_pay.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$in = json_input();
if ($in === null) { log_api('refused'); exit; }
if (!cfg('payments_live')) { json_out(503); log_api('not_live'); exit; }

$ip = rk('o:' . ip_key());
if (cfg('per_ip_limits')) {
    if (!under($ip, 10, 50)) { json_out(429); log_api('ip_limit'); exit; }
    hit($ip);
}

$plan = (string)($in['plan'] ?? '');
$lang = ($in['lang'] ?? '') === 'en' ? 'en' : 'fr';
$addr = normal_address((string)($in['email'] ?? ''));
$price = cfg('prices')[$plan] ?? null;
if (!isset(PLANS[$plan]) || !is_string($price) || ($in['cgv'] ?? null) !== true || $addr === null) {
    json_out(400); log_api('invalid'); exit;
}

/* A live subscription already: nothing is created, the address is told. */
$live = q("SELECT order_id FROM subscriptions WHERE email = ? AND status IN ('active', 'trialing', 'past_due')", [$addr])->fetch();
if ($live) {
    queue('already', 'already:' . $addr . ':' . date('Y-m-d-H'), $addr, $lang, $live['order_id'], ['ref' => $live['order_id']]);
    json_out(200, ['mailed' => true]);
    log_api('already');
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    send_outbox(5, $T0 + 140, $live['order_id']);
    exit;
}

$id = bin2hex(random_bytes(16));
q('INSERT INTO orders (id, email, plan, lang, cgv_version, cgv_at, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [$id, $addr, $plan, $lang, (string)cfg('cgv_version'), now(), now()]);

$t = PAY_TEXT[$lang];
[$code, $s] = stripe('POST', '/v1/checkout/sessions', [
    'mode' => 'subscription',
    'line_items' => [['price' => $price, 'quantity' => 1]],
    'customer_email' => $addr,
    'client_reference_id' => $id,
    'metadata' => ['order' => $id],
    'subscription_data' => ['metadata' => ['order' => $id]],
    'locale' => $lang,
    'success_url' => cfg('origin') . '/merci/',
    'cancel_url' => cfg('origin') . '/commande/',
    'expires_at' => now() + 3600,
    'custom_text' => ['submit' => ['message' => $t['submit_' . $plan]]],
], 'order:' . $id);
$url = is_array($s) ? (string)($s['url'] ?? '') : '';
if ($code !== 200 || !preg_match('#^https://#', $url) || !is_string($s['id'] ?? null)) {
    json_out(502); log_api('stripe_' . $code); exit;
}
q('UPDATE orders SET session = ? WHERE id = ?', [$s['id'], $id]);
json_out(200, ['url' => $url]);
log_api('session');
