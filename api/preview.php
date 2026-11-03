<?php
/* GET ?id=…: the sample a free entry's locked pairings show, {ids: [...]}, at
   most three of its pairings and never a drink, read from api/_preview.json
   (tools/build-free.js). The full lists stay in the full version: the whole
   file is all a visitor without access can ever get, so it needs no limit per
   connection, and no IP is read. Its log line is also the count of locked
   pairings seen. */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { json_out(405); exit; }
$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[a-z0-9-]{1,64}$/', $id)) { json_out(400); log_api('invalid'); exit; }

$all = json_decode((string)@file_get_contents(__DIR__ . '/_preview.json'), true);
if (!is_array($all)) { log_php('preview: api/_preview.json missing or unreadable'); json_out(503); log_api('no_file'); exit; }
$ids = is_array($all[$id] ?? null) ? array_slice(array_values(array_filter($all[$id], 'is_string')), 0, 3) : [];
http_response_code(200);
api_headers('private, max-age=3600');
header('Content-Type: application/json');
echo json_encode(['ids' => $ids]);
log_api($ids ? 'sample' : 'none');
