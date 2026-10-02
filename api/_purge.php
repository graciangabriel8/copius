<?php
/* The deletions the privacy page promises, every hour whatever the traffic:
   run by an OVH scheduled task (copius/api/_purge.php, PHP 8.4, hourly). The
   endpoints' purge_soon() still deletes in between. Never over HTTP: the "_"
   name is a 404 already (the site's .htaccess), and a web request is refused
   here too, whatever SAPI the scheduler uses. A failure exits 1 with a line on
   stderr, which OVH mails to the address set on the task. */
declare(strict_types=1);
if (isset($_SERVER['REQUEST_METHOD'])) { http_response_code(404); exit; }
require __DIR__ . '/_lib.php';
if (!purge()) {
    log_api('purge_failed');
    fwrite(fopen('php://stderr', 'w'), "Copius purge failed: see copius-private/logs/php-*.log\n");
    exit(1);
}
log_api('purged');
