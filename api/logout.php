<?php
/* POST {all}: this session, or every session of the account, ends; both
   cookies go, and the browser drops the cached bundle (DESIGN.md section 2).
   The cookies go even when the database does not answer, so a shared computer
   is signed out whatever happens; the 503 then says the rows did not. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(405); exit; }
$in = json_input();
if ($in === null) { log_api('refused'); exit; }

$all = !empty($in['all']);
$s = null; $done = true;
try {
    $s = current_session();
    if ($s) {
        if ($all) q('DELETE FROM sessions WHERE account_id = ?', [$s['account_id']]);
        else q('DELETE FROM sessions WHERE id_hash = ?', [$s['id_hash']]);
    }
} catch (Throwable $e) {
    log_php('logout: ' . describe($e));
    $done = false;
}
clear_cookies();
header('Clear-Site-Data: "cache"');
json_out($done ? 204 : 503);
log_api($done ? ($all ? 'signed_out_all' : 'signed_out') : 'unavailable', $s ? (int)$s['account_id'] : null);
