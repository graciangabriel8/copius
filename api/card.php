<?php
/* The Instagram cards once the repository is private (DESIGN.md section 7).
   The .htaccess sends /social/<id>.jpg and <id>.2.jpg here; a card is served
   on its day and the next, counted in Paris time from social/schedule.json,
   and anything else is a 404. /api/card.php?f= is also reachable directly,
   so f is checked here as well, and the file opened is built from the
   schedule's own id, never from f. Needs neither the database nor
   copius-private: the daily post must not depend on them. */
declare(strict_types=1);
header_remove('X-Powered-By');

function not_found(): never {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo "Not found\n";
    exit;
}

$f = $_GET['f'] ?? '';
if (!is_string($f) || !preg_match('/^([a-z0-9-]+)(\.2)?\.jpg$/', $f, $m)) not_found();
$sched = json_decode((string)@file_get_contents(dirname(__DIR__) . '/social/schedule.json'), true);
if (!is_array($sched) || !isset($sched['start'], $sched['days']) || !is_array($sched['days'])) not_found();

$tz = new DateTimeZone('Europe/Paris');
$start = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$sched['start'], $tz);
if (!$start) not_found();
$day = (int)$start->diff(new DateTimeImmutable('today', $tz))->format('%r%a');
$id = null;
foreach ([$day, $day - 1] as $k) {
    $s = $sched['days'][$k] ?? null;
    if (is_string($s) && $s === $m[1] && preg_match('/^[a-z0-9-]+$/', $s)) { $id = $s; break; }
}
if ($id === null) not_found();

$path = dirname(__DIR__) . '/social/' . $id . (($m[2] ?? '') === '.2' ? '.2' : '') . '.jpg';
if (!is_file($path)) not_found();
header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($path));
readfile($path);
