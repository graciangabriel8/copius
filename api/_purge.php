<?php
/* The hourly job, run by an OVH scheduled task (copius/api/_purge.php, PHP 8.4,
   hourly): the deletions the privacy page promises, whatever the traffic (the
   endpoints' purge_soon() still deletes in between); then, once config.php
   says the payment tables exist, the payment steps of DESIGN-PAYMENT.md section 5, each in
   its own try so one failing does not stop the others: requests left
   unfinished, renewal notices, then the mails they queued. Never over HTTP: the "_"
   name is a 404 already (the site's .htaccess), and a web request is refused
   here too, whatever SAPI the scheduler uses. A failure exits 1 with a line on
   stderr, which OVH mails to the address set on the task. */
declare(strict_types=1);
if (isset($_SERVER['REQUEST_METHOD'])) { http_response_code(404); exit; }
require __DIR__ . '/_lib.php';
$failed = [];
if (!purge()) $failed[] = 'purge';
if (cfg('payment_tables')) {
    require __DIR__ . '/_mail.php';
    require __DIR__ . '/_pay.php';
    $steps = [
        'purge_payments' => fn() => purge_payments(),
        'stripe_retries' => fn() => pending_stripe_calls($T0 + 60),
        'notices' => fn() => renewal_notices(),
        'outbox' => fn() => send_outbox(20, $T0 + 140),
        /* Mails that gave up are reported here, through OVH's mail, not ours. */
        'stuck_mail' => function () { if (stuck_mail() > 0) throw new RuntimeException(stuck_mail() . ' mails gave up: see the outbox table'); },
    ];
    foreach ($steps as $name => $step) {
        try { $step(); } catch (Throwable $e) { log_php("$name: " . describe($e)); $failed[] = $name; }
    }
}
if ($failed) {
    log_api('failed ' . implode(',', $failed));
    fwrite(fopen('php://stderr', 'w'), 'Copius hourly job failed (' . implode(', ', $failed) . "): see copius-private/logs/php-*.log\n");
    exit(1);
}
log_api('purged');
