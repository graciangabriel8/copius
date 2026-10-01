<?php
/* GET: {email, access} for the account dialog, or 401 (DESIGN.md section 2).
   In probe mode it also says which PHP and SQL mode production really has. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

try {
    $s = current_session();
    if (!$s) { clear_cookies(); json_out(401); log_api('ended'); exit; }
    $out = ['email' => (string)$s['email'], 'access' => access_for((string)$s['email'])['access']];
    if (cfg('probe_mode')) {
        $out['php'] = PHP_VERSION;
        $out['ffr'] = function_exists('fastcgi_finish_request');
        $out['sql_mode'] = db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? (string)q('SELECT @@SESSION.sql_mode')->fetchColumn() : 'sqlite';
    }
} catch (Throwable $e) {
    log_php('me: ' . describe($e));
    json_out(503); log_api('unavailable'); exit;
}
json_out(200, $out);
log_api('ok');
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
purge_soon();
