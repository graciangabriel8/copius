<?php
/* Copius sign-in: what every endpoint shares. The design is DESIGN.md
   (kairos/copius-step2); section numbers below refer to it.
   Names starting with "_" answer 404 over HTTP (the site's .htaccess), so this
   file is only ever included. */
declare(strict_types=1);

const COOKIE_S = '__Host-copius_s';
const COOKIE_FULL = '__Host-copius_full';
const SESSION_LIFE = 30 * 86400;
const TOKEN_LIFE = 15 * 60;
const BUNDLE_FORMAT = 1;

$T0 = microtime(true);
/* copius-private sits beside the site folder, outside every site root (section 2). */
define('PRIV', dirname(__DIR__, 2) . '/copius-private');
define('SITE', dirname(__DIR__));
date_default_timezone_set('Europe/Paris');
header_remove('X-Powered-By');

/* Errors go to php-<host>-<date>.log through these handlers, never to the page:
   PHP's own error_log setting never rotates (section 2, the logs). */
/* A warning silenced with @ stays silent: PHP 8 still calls this handler for
   it, and throwing there would turn a refused SMTP connect into an exception
   that skips the retry and the purge. */
set_error_handler(function (int $no, string $msg, string $file, int $line): bool {
    if (!(error_reporting() & $no)) return false;
    throw new ErrorException($msg, 0, $no, $file, $line);
});
set_exception_handler(function (Throwable $e): void {
    log_php(describe($e));
    if (!headers_sent()) { http_response_code(500); api_headers(); }
});

/* What reaches php.log about an error. A driver's own message can quote a
   value ("Duplicate entry 'prof@x.fr'"), so a database error is logged by its
   codes alone. */
function describe(Throwable $e): string {
    $what = $e instanceof PDOException
        ? 'PDOException ' . $e->getCode() . '/' . ($e->errorInfo[1] ?? '')
        : get_class($e) . ': ' . $e->getMessage();
    return $what . ' at ' . basename($e->getFile()) . ':' . $e->getLine();
}
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        log_php('fatal: ' . $e['message'] . ' at ' . basename($e['file']) . ':' . $e['line']);
    }
});

$CFG = require PRIV . '/config.php';
/* 32 bytes generated on the Mac and uploaded with config.php. PHP never makes
   one: a key another web server read half-written would be empty (section 2). */
$KEY = @file_get_contents(PRIV . '/hmac.key');
if (!is_string($KEY) || strlen($KEY) !== 32) {
    log_php('hmac.key is missing or not 32 bytes');
    if (!isset($_SERVER['REQUEST_METHOD'])) { fwrite(fopen('php://stderr', 'w'), "hmac.key is missing or not 32 bytes\n"); exit(1); }
    http_response_code(503); api_headers(); exit;
}

function cfg(string $k) { global $CFG; return $CFG[$k] ?? null; }

/* Every /api/ answer. The Expires stops OVH's mod_expires from adding a
   max-age of its own; only the bundle is cacheable, and then only with a
   check back to the server every time (decision 2). */
function api_headers(string $cache = 'private, no-store'): void {
    header('Cache-Control: ' . $cache);
    header('Expires: Thu, 01 Jan 1970 00:00:00 GMT');
    header('X-Content-Type-Options: nosniff');
    header('Cross-Origin-Resource-Policy: same-origin');
}

function json_out(int $code, ?array $body = null): void {
    http_response_code($code);
    api_headers();
    if ($body !== null) { header('Content-Type: application/json'); echo json_encode($body); }
}

/* A POST from the atlas and nowhere else: JSON, from copius.fr's own pages. A
   form on another site can send neither the Origin nor the content type. */
function json_input(): ?array {
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== cfg('origin') || ($site !== '' && $site !== 'same-origin')) {
        json_out(403); return null;
    }
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) { json_out(415); return null; }
    $raw = file_get_contents('php://input', false, null, 0, 4096);
    $in = json_decode((string)$raw, true);
    if (!is_array($in)) { json_out(400); return null; }
    return $in;
}

function now(): int { return time(); }
function today(): string { return date('Y-m-d'); }

/* ---------- storage ---------- */

$PDO = null;
function db(): PDO {
    global $PDO;
    if ($PDO) return $PDO;
    $d = cfg('db');
    $PDO = new PDO($d['dsn'], $d['user'] ?? null, $d['pass'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    return $PDO;
}

/* Let the connection go before a long wait (SMTP, its retry): the database
   takes 30 connections at once, and readers need them. The next q() reopens. */
function db_release(): void { global $PDO; $PDO = null; }

function q(string $sql, array $args = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

/* ---------- addresses and access (section 2, matching an address) ---------- */

/* Trimmed and lower-cased; null for anything that is not printable ASCII or
   not shaped like an address. The caller answers the same 200 either way. */
function normal_address(string $s): ?string {
    $s = strtolower(trim($s));
    if (strlen($s) > 254 || !preg_match('/^[\x21-\x7e]+@[\x21-\x7e]+$/', $s) || substr_count($s, '@') !== 1) return null;
    return $s;
}

/* A grant is open when until is NULL, '' or 0000-00-00 (what a blank field
   becomes in a non-strict SQL mode), or a date not yet past. */
function until_open($u): bool {
    return $u === null || $u === '' || $u === '0000-00-00' || (string)$u >= today();
}

/* Every grant row whose normalised address equals this one. Binary keys let
   "Prof@x.fr" and "prof@x.fr" coexist: any row with access gives access, and
   the largest max_sessions among those rows sets the cap. */
function access_for(string $addr): array {
    $rows = q('SELECT email, until, max_sessions FROM grants WHERE LOWER(TRIM(email)) = ?', [$addr])->fetchAll();
    $open = array_values(array_filter($rows, fn($r) => until_open($r['until'])));
    return [
        'access' => (bool)$open,
        'address' => $open ? strtolower(trim($open[0]['email'])) : null,
        'cap' => $open ? max(array_map(fn($r) => (int)$r['max_sessions'], $open)) : 0,
        'zero' => (bool)array_filter($rows, fn($r) => $r['until'] === '0000-00-00'),
    ];
}

/* ---------- rate limits (section 3) ---------- */

/* REMOTE_ADDR and nothing else: a forwarded header is the client's to set.
   IPv6 counts by its /56. */
function ip_key(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $bin = @inet_pton($ip);
    if ($bin !== false && strlen($bin) === 16) $ip = inet_ntop(substr($bin, 0, 7) . str_repeat("\0", 9)) . '/56';
    return $ip;
}

function rk(string $s): string { global $KEY; return substr(hash_hmac('sha256', $s, $KEY), 0, 32); }

function lim(int $n): int { return cfg('probe_mode') ? $n * 10 : $n; }

function hits(string $k, int $window): int {
    return (int)q('SELECT COUNT(*) FROM rate_events WHERE k = ? AND at > ?', [$k, now() - $window])->fetchColumn();
}

function hit(string $k): void { q('INSERT INTO rate_events (k, at) VALUES (?, ?)', [$k, now()]); }

/* A limit over which the request is answered without being recorded, so the
   table only grows with what the limits let through. */
function under(string $k, int $per15, int $per24h = 0): bool {
    return hits($k, 900) < lim($per15) && ($per24h === 0 || hits($k, 86400) < lim($per24h));
}

/* ---------- sessions and cookies (section 3) ---------- */

function b64url(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }

function set_cookies(string $sid): void {
    $tail = '; Max-Age=' . SESSION_LIFE . '; Path=/; Secure; SameSite=Lax';
    header('Set-Cookie: ' . COOKIE_S . '=' . $sid . $tail . '; HttpOnly', false);
    header('Set-Cookie: ' . COOKIE_FULL . '=1' . $tail, false);
}

function clear_cookies(): void {
    foreach ([COOKIE_S, COOKIE_FULL] as $c) header("Set-Cookie: $c=; Max-Age=0; Path=/; Secure; SameSite=Lax", false);
}

/* The session behind the cookie, with its account, or null. Its last use and
   expiry move at most once a day, and both cookies are sent again when they do. */
function current_session(): ?array {
    $sid = $_COOKIE[COOKIE_S] ?? '';
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $sid)) return null;
    $s = q('SELECT s.id_hash, s.account_id, s.last_seen, a.email FROM sessions s JOIN accounts a ON a.id = s.account_id
            WHERE s.id_hash = ? AND s.expires > ?', [hash('sha256', $sid), now()])->fetch();
    if (!$s) return null;
    if (now() - (int)$s['last_seen'] > 86400) {
        q('UPDATE sessions SET last_seen = ?, expires = ? WHERE id_hash = ?', [now(), now() + SESSION_LIFE, $s['id_hash']]);
        set_cookies($sid);
    }
    return $s;
}

/* ---------- logs (section 2) ---------- */

function log_file(string $kind): string {
    $host = preg_replace('/[^a-z0-9.-]/', '', strtolower((string)gethostname())) ?: 'host';
    return PRIV . "/logs/$kind-$host-" . date('Y-m-d') . '.log';
}

function log_line(string $kind, string $line): void {
    if (!is_dir(PRIV . '/logs')) @mkdir(PRIV . '/logs', 0700);
    @file_put_contents(log_file($kind), date('c') . ' ' . $line . "\n", FILE_APPEND | LOCK_EX);
}

/* Time, endpoint, outcome and duration; no address and no IP. The account id
   only where the caller passes it: verify and logout, never premium. */
function log_api(string $outcome, ?int $account = null): void {
    global $T0;
    log_line('api', basename($_SERVER['SCRIPT_NAME'] ?? '?', '.php') . ' ' . $outcome .
        ' ' . (int)round((microtime(true) - $T0) * 1000) . 'ms' .
        ($account !== null ? " account=$account" : '') . (cfg('probe_mode') ? ' probe' : ''));
}

function log_php(string $msg): void { log_line('php', $msg); }

/* Any server deletes any log file whose name carries a day more than 30 days
   old, so a web server that left the pool leaves nothing behind. */
function prune_logs(): void {
    $cut = date('Y-m-d', now() - 30 * 86400);
    foreach (glob(PRIV . '/logs/*-????-??-??.log') ?: [] as $f) {
        if (preg_match('/-(\d{4}-\d{2}-\d{2})\.log$/', $f, $m) && $m[1] < $cut) @unlink($f);
    }
}

/* The deletions the privacy page promises (DESIGN.md section 2). An hourly OVH
   scheduled task runs them through _purge.php, so they hold in a month with no
   sign-in at all; every endpoint that runs after its answer also calls
   purge_soon(), which does the work at most once an hour in between. Links go
   at 23 hours, so with a run every hour none is older than the page's « sous
   24 heures »; rate events keep their full 24 hours, which the limits count. */
function purge(): bool {
    try {
        $n = now();
        q('DELETE FROM login_tokens WHERE created < ?', [$n - 23 * 3600]);
        q('DELETE FROM rate_events WHERE at < ?', [$n - 86400]);
        q('DELETE FROM sessions WHERE expires < ?', [$n]);
        /* A grant goes 12 months after a real end date; NULL, '' and
           0000-00-00 are open and never counted from. */
        $cut = date('Y-m-d', strtotime('-12 months', $n));
        foreach (q('SELECT email, until FROM grants WHERE until IS NOT NULL')->fetchAll() as $g) {
            $u = (string)$g['until'];
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $u) && $u !== '0000-00-00' && $u < $cut) {
                q('DELETE FROM grants WHERE email = ?', [$g['email']]);
            }
        }
        /* An account, its sessions and its links go once no grant row for its
           address remains; the address normalised by SQL, as the access check does. */
        $kept = array_flip(q('SELECT DISTINCT LOWER(TRIM(email)) FROM grants')->fetchAll(PDO::FETCH_COLUMN));
        foreach (q('SELECT id, email FROM accounts')->fetchAll() as $a) {
            if (isset($kept[$a['email']])) continue;
            q('DELETE FROM sessions WHERE account_id = ?', [$a['id']]);
            q('DELETE FROM login_tokens WHERE email = ?', [$a['email']]);
            q('DELETE FROM accounts WHERE id = ?', [$a['id']]);
        }
        prune_logs();
        return true;
    } catch (Throwable $e) {
        log_php('purge: ' . describe($e));
        return false;
    }
}

function purge_soon(): void {
    try {
        $k = rk('purge');
        if (hits($k, 3600) > 0) return;
        hit($k);
    } catch (Throwable $e) {
        log_php('purge: ' . describe($e)); return;
    }
    purge();
}
