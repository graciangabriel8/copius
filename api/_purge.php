<?php
/* The deletions the privacy page promises, once a day whatever the traffic:
   run by an OVH scheduled task (PHP 8.4, daily). The endpoints' purge_soon()
   still deletes between runs. Command line only; over HTTP the "_" name is a
   404 already (the site's .htaccess). */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/_lib.php';
purge();
log_api('purged');
