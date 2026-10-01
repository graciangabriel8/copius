<?php
/* POST {t}: spend the link's token once, check access again, create the
   account on its first sign-in, open a session, keep the device cap, set both
   cookies. One transaction (DESIGN.md sections 2 and 3). */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$in = json_input();
if ($in === null) { log_api('refused'); exit; }

/* 20 per 15 minutes, and a daily ceiling too, so verify is not the cheap way
   to fill rate_events. */
$v = rk('v:' . ip_key());
if (cfg('per_ip_limits')) {
    if (!under($v, 20, 100)) { json_out(429); log_api('ip_limit'); exit; }
    hit($v);
}

/* Unknown, used and expired answer alike. */
$t = (string)($in['t'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $t)) { json_out(410); log_api('gone'); exit; }
$h = hash('sha256', $t);

/* The whole sign-in, as one transaction. Returns the answer's status and the
   account id; throws on a database error, rolled back. */
function sign_in(string $h, string &$sid): array {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (q('UPDATE login_tokens SET used = 1 WHERE token_hash = ? AND used = 0 AND expires > ?', [$h, now()])->rowCount() !== 1) {
            $pdo->rollBack();
            return [410, null];
        }
        $tok = q('SELECT email, lang FROM login_tokens WHERE token_hash = ?', [$h])->fetch();
        $acc = access_for((string)$tok['email']);
        if (!$acc['access']) { $pdo->commit(); return [403, null]; }   // the token stays spent
        if ($acc['zero']) log_api('until_zero');
        $a = q('SELECT id FROM accounts WHERE email = ?', [$acc['address']])->fetch();
        if ($a) {
            $id = (int)$a['id'];
            q('UPDATE accounts SET last_login = ?, lang = ? WHERE id = ?', [now(), $tok['lang'], $id]);
        } else {
            q('INSERT INTO accounts (email, lang, created, last_login) VALUES (?, ?, ?, ?)', [$acc['address'], $tok['lang'], now(), now()]);
            $id = (int)$pdo->lastInsertId();
        }
        $sid = b64url(random_bytes(32));
        q('INSERT INTO sessions (id_hash, account_id, created, last_seen, expires) VALUES (?, ?, ?, ?, ?)',
          [hash('sha256', $sid), $id, now(), now(), now() + SESSION_LIFE]);
        /* Beyond the cap, the least recently used sessions go: picked here and
           deleted by key, since MySQL refuses a DELETE whose subquery reads its
           own table. */
        $ids = q('SELECT id_hash FROM sessions WHERE account_id = ? ORDER BY last_seen DESC, created DESC', [$id])->fetchAll(PDO::FETCH_COLUMN);
        foreach (array_slice($ids, max(1, $acc['cap'])) as $old) q('DELETE FROM sessions WHERE id_hash = ?', [$old]);
        $pdo->commit();
        return [200, $id];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/* Two first sign-ins of one address at the same moment: the second insert
   meets the first account on its unique key. The rollback also un-spent the
   token, so one more try, with a fresh view, finds the account. */
$sid = '';
try {
    try { [$code, $id] = sign_in($h, $sid); }
    catch (PDOException $e) {
        if ($e->getCode() !== '23000') throw $e;
        [$code, $id] = sign_in($h, $sid);
    }
} catch (Throwable $e) {
    log_php('verify: ' . describe($e));
    json_out(503); log_api('unavailable'); exit;
}
if ($code !== 200) { json_out($code); log_api($code === 410 ? 'gone' : 'no_access'); exit; }
set_cookies($sid);
json_out(200, ['ok' => true]);
log_api('signed_in', $id);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
purge_soon();
