<?php
/* POST {email, plan, country, cgv: true, lang, trial}: the order, then a Stripe
   Checkout Session made for it, server-side (DESIGN-PAYMENT.md section 1).
   Answers {url} to go and pay, or {mailed: true} when the address already
   subscribes; 403 {error: country} for a buyer living where Copius is not sold;
   409 {error: offer, trial, used} when the free trial the page showed (trial, in
   days) is not the one this address gets, so the buyer reads the right one
   before paying. */
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
$country = is_string($in['country'] ?? null) ? $in['country'] : '';
$price = cfg('prices')[$plan] ?? null;
if (!isset(PLANS[$plan]) || !is_string($price) || ($in['cgv'] ?? null) !== true || $addr === null
    || !preg_match('/^[A-Z]{2}$/', $country)) {
    json_out(400); log_api('invalid'); exit;
}
/* The country the buyer declares (CGV 2.1), kept with the order at Stripe. */
if (in_array($country, BLOCKED_COUNTRIES, true)) { json_out(403, ['error' => 'country']); log_api('country'); exit; }
/* The confirmation attaches the CGV the buyer accepted: no file, no sale. */
if (!is_file(cgv_pdf((string)cfg('cgv_version'), 'fr'))) { json_out(503); log_api('no_cgv'); exit; }

/* A live subscription already: nothing is created, the address is told, at
   most once a day. */
$live = q("SELECT order_id FROM subscriptions WHERE email = ? AND status IN ('active', 'trialing', 'past_due')", [$addr])->fetch();
if ($live) {
    queue('already', 'already:' . $addr . ':' . today(), $addr, $lang, $live['order_id'], ['ref' => $live['order_id']]);
    json_out(200, ['mailed' => true]);
    log_api('already');
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    send_outbox(5, $T0 + 140, $live['order_id']);
    exit;
}

/* One free trial per address (CGV 4.5): an address that ever subscribed, trial
   or not, starts paying on the day; « used » tells the page which it is. Like
   « mailed » above, the answer says whether an address subscribed before. */
$trial = max(0, (int)cfg('trial_days'));
$used = $trial && q('SELECT 1 FROM subscriptions WHERE email = ? LIMIT 1', [$addr])->fetch();
if ($used) $trial = 0;
if (($in['trial'] ?? 0) !== $trial) { json_out(409, ['error' => 'offer', 'trial' => $trial, 'used' => (bool)$used]); log_api('offer'); exit; }

$id = bin2hex(random_bytes(16));
q('INSERT INTO orders (id, email, plan, lang, cgv_version, cgv_at, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [$id, $addr, $plan, $lang, (string)cfg('cgv_version'), now(), now()]);

$t = PAY_TEXT[$lang];
/* The trial ends $trial days to the second after the payment page is done, and
   the first charge comes then: the date is today's plus the trial, or a day
   later for a page finished after midnight, never earlier than said. */
$submit = $trial
    ? strtr($t['submit_trial_' . $plan], ['{n}' => (string)$trial, '{d}' => fmt_date(paris_date(now() + $trial * 86400), $lang)])
    : $t['submit_' . $plan];
[$code, $s] = stripe('POST', '/v1/checkout/sessions', [
    'mode' => 'subscription',
    /* Card only (CGV 4.2, his call 4 Oct 2026), whatever methods the account shared with
       Manager and Jobs has switched on: no SEPA, Klarna or Link. Apple Pay and Google Pay
       pay with a card and stay. Dahlia only: endive answers 400 to payment_method_types
       (the order then fails with 502), so moving stripe_api_version to endive renames this
       allowed_payment_method_types. */
    'payment_method_types' => ['card'],
    // Card alone still offers Link as a card wallet; he wants card and Apple Pay only.
    'wallet_options' => ['link' => ['display' => 'never']],
    'line_items' => [['price' => $price, 'quantity' => 1]],
    'customer_email' => $addr,
    'client_reference_id' => $id,
    'metadata' => ['order' => $id, 'country' => $country],
    'subscription_data' => ['metadata' => ['order' => $id, 'country' => $country]]
        + ($trial ? ['trial_period_days' => $trial] : []),
    /* The card is taken at signup even when nothing is due today (Stripe's own
       default, said aloud): the trial converts by itself unless cancelled. */
    'payment_method_collection' => 'always',
    'locale' => $lang,
    /* The euro price only, whatever the card (CGV 4.1, « aucun autre frais »), whatever the
       account-wide Dashboard setting. The string, as http_build_query turns false into 0. */
    'adaptive_pricing' => ['enabled' => 'false'],
    'success_url' => cfg('origin') . '/merci/',
    'cancel_url' => cfg('origin') . '/commande/#retour',
    'expires_at' => now() + 3600,
    'custom_text' => ['submit' => ['message' => nb($submit, $lang)]],
], 'order:' . $id);
$url = is_array($s) ? (string)($s['url'] ?? '') : '';
if ($code !== 200 || !preg_match('#^https://#', $url) || !is_string($s['id'] ?? null)) {
    json_out(502); log_api('stripe_' . $code); exit;
}
q('UPDATE orders SET session = ? WHERE id = ?', [$s['id'], $id]);
json_out(200, ['url' => $url]);
log_api('session');
