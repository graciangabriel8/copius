<?php
/* POST ?e=…: one line in the day's count log, the time and the event's name,
   nothing else: no cookie is read or set, no address, no IP, no identifier,
   so the counts are anonymous and need no consent (CNIL, mesure d'audience).
   The atlas and the order page send them with navigator.sendBeacon. Counting
   is grep and wc over PRIV/logs/count-*.log, pruned after 30 days like every
   log. A day's file stops growing at COUNT_CAP bytes per web server: past it,
   events are dropped and the answer is the same. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

const COUNT_EVENTS = ['order_view', 'order_review', 'locked_open', 'locked_view', 'preview_cta', 'cta'];
const COUNT_CAP = 1048576;                              // about 25,000 events a day per web server

$site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
$e = (string)($_GET['e'] ?? '');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
if (($site !== '' && $site !== 'same-origin') || !in_array($e, COUNT_EVENTS, true)) { json_out(400); exit; }
clearstatcache();
if ((int)@filesize(log_file('count')) < COUNT_CAP) log_line('count', $e);
json_out(204);
