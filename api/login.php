<?php
/* POST {email, lang}: the same answer for every address, given before the
   address is even looked at; then, with the connection released, a link for an
   address that has access, within the limits (DESIGN.md sections 2 and 3). */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$in = json_input();
if ($in === null) { log_api('refused'); exit; }

/* The per-IP limit is the only one the answer shows, and it says nothing about
   the address. Recorded for every request it lets through, so it counts them all. */
$ip = rk('i:' . ip_key());
try {
    if (cfg('per_ip_limits')) {
        if (!under($ip, 10, 50)) { json_out(429); log_api('ip_limit'); exit; }
        hit($ip);
    }
} catch (Throwable $e) {
    log_php('login limits: ' . describe($e));   // the database: answer as usual, send nothing
    json_out(200, ['ok' => true]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    log_api('unavailable');
    purge_soon();                                // a READ ONLY database still deletes
    exit;
}

json_out(200, ['ok' => true]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
/* Whatever path follows, the deletions get their chance (at most once an hour). */
register_shutdown_function('purge_soon');

$typed = (string)($in['email'] ?? '');
$lang = ($in['lang'] ?? '') === 'en' ? 'en' : 'fr';
$addr = normal_address($typed);
if ($addr === null) { log_api(preg_match('/[^\x00-\x7f]/', $typed) ? 'nonascii' : 'malformed'); exit; }

/* The address limits apply whether or not the address has access. The pair of
   address and IP, so a stranger elsewhere cannot spend the owner's budget. */
$pair = rk('e:' . $addr . '|i:' . ip_key());
if (!under($pair, 3, 10)) { log_api('address_limit'); exit; }
hit($pair);

$acc = access_for($addr);
if ($acc['zero']) log_api('until_zero');
if (!$acc['access']) { log_api('no_access'); exit; }

$alone = rk('e:' . $addr);
if (hits($alone, 86400) >= lim((int)(cfg('address_ceiling') ?? 20))) { log_api('address_ceiling'); exit; }
if (hits(rk('mail'), 3600) >= 40) { log_api('site_cap'); exit; }

/* Only the newest link per address works: the old ones go in the same
   transaction the new one is written in. From here on, only the grant's stored
   address is used: in the table, in the To: and in the account. */
$token = b64url(random_bytes(32));
db()->beginTransaction();
q('DELETE FROM login_tokens WHERE email = ? AND used = 0', [$acc['address']]);
q('INSERT INTO login_tokens (token_hash, email, lang, created, expires, used) VALUES (?, ?, ?, ?, ?, 0)',
  [hash('sha256', $token), $acc['address'], $lang, now(), now() + TOKEN_LIFE]);
db()->commit();
hit($alone);
hit(rk('mail'));

$link = cfg('origin') . '/connexion/#t=' . $token . '&l=' . $lang;
db_release();
log_api(send_link($acc['address'], $lang, $link, $T0));
