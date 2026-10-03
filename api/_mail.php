<?php
/* The sign-in mail (DESIGN.md section 5) and the SMTP client that carries it.
   Hand-written rather than a mail library, so nothing is downloaded and every
   step has a hard limit:
   - implicit TLS to the mailbox's server, with the certificate and its name
     checked, and never a plaintext fallback;
   - AUTH only inside that TLS, and the password in no log and no error string;
   - every reply code checked, and the first unexpected one ends the session;
   - CR and LF refused in every header value before anything is written;
   - the text and HTML parts quoted-printable UTF-8 with CRLF endings, the
     banner base64, and the whole message dot-stuffed;
   - a timeout on the connect and on each read, inside the request's time. */
declare(strict_types=1);

/* One set of words per language: the plain-text part and the HTML part are
   both built from it, so the two never say different things. */
const MAIL_TEXT = [
    'fr' => [
        'subject' => "Votre lien de connexion à Copius",
        'alt'     => "Copius, un atlas illustré de la cuisine",
        'hello'   => "Bonjour,",
        'lead'    => "Voici votre lien pour vous connecter à la version complète de Copius.",
        'button'  => "Me connecter",
        'expiry'  => "Il est valable 15 minutes et ne sert qu’une fois. Ouvrez-le sur l’appareil où vous lisez Copius.",
        'copy'    => "Le bouton ne s’ouvre pas\u{202F}? Copiez cette adresse dans votre navigateur\u{00A0}:",
        'ignore'  => "Vous n’avez rien demandé\u{202F}? Ignorez ce message\u{00A0}: sans ce lien, personne ne peut se connecter à votre place.",
        'bye'     => "Bonne lecture, et bonne cuisine.",
    ],
    'en' => [
        'subject' => "Your Copius sign-in link",
        'alt'     => "Copius, an illustrated atlas of cooking",
        'hello'   => "Hello,",
        'lead'    => "Here is your link to sign in to the full version of Copius.",
        'button'  => "Sign me in",
        'expiry'  => "It works once, within 15 minutes. Open it on the device where you read Copius.",
        'copy'    => "Button not opening? Copy this address into your browser:",
        'ignore'  => "Didn’t ask for this? Ignore this email: without the link, nobody can sign in as you.",
        'bye'     => "Happy reading, and happy cooking.",
    ],
];

/* The banner on top of the HTML part travels inside the message (a cid: part),
   so opening the mail fetches nothing from anywhere. A name starting with "_"
   is never served. Missing, the mail goes without it. */
const MAIL_BANNER = __DIR__ . '/_mail-banner.jpg';

function header_safe(string ...$values): bool {
    foreach ($values as $v) if (preg_match('/[\r\n\0]/', $v)) return false;
    return true;
}

/* RFC 2047 for anything that is not plain ASCII. */
function mime_word(string $s): string {
    return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/* The sign-in message, or null when any header value carries a line break or
   the address is not the plain ASCII one the grant holds. */
function mail_message(string $to, string $lang, string $link): ?array {
    $lang = isset(MAIL_TEXT[$lang]) ? $lang : 'fr';
    $t = MAIL_TEXT[$lang];
    if (!header_safe($link)) return null;
    $text = implode("\n\n", [$t['hello'], $t['lead'], $link, $t['expiry'], $t['ignore'], $t['bye'],
        'Copius · contact@copius.fr']) . "\n";
    return mail_build($to, $t['subject'], $text, fn(bool $banner): string => mail_html($t, $lang, $link, $banner));
}

/* Any Copius mail: the plain text and the HTML (built knowing whether the banner
   travels with it), the banner as an inline part, any attached files
   ([filename, type, bytes], the order's CGV), the headers. Null when a header
   value carries a line break or the address is not plain ASCII. */
function mail_build(string $to, string $subject, string $text, callable $html, array $files = []): ?array {
    $from = (string)cfg('from'); $name = (string)cfg('from_name'); $reply = (string)cfg('reply_to');
    if (!header_safe($to, $from, $name, $reply, $subject)) return null;
    if (!preg_match('/^[\x21-\x7e]+@[\x21-\x7e]+$/', $to) || strpbrk($to, '<>,;"()[]\\') !== false) return null;
    $img = is_file(MAIL_BANNER) ? @file_get_contents(MAIL_BANNER) : false;
    if (!is_string($img) || strncmp($img, "\xFF\xD8", 2) !== 0) $img = false;    // empty or not a JPEG: no banner
    $qp = fn(string $s): string => quoted_printable_encode(str_replace("\n", "\r\n", $s));
    /* "=_" never occurs in quoted-printable or base64, so no part can hold a boundary. */
    $id = bin2hex(random_bytes(8));
    $type = "multipart/alternative; boundary=\"=_a$id\"";
    $body = mime_parts("=_a$id", [
        "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" . $qp($text),
        "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" .
            $qp($html($img !== false)),
    ]);
    if ($img !== false) {
        $body = mime_parts("=_r$id", [
            "Content-Type: $type\r\n\r\n" . $body,
            "Content-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <banner@copius.fr>\r\n" .
                "Content-Disposition: inline; filename=\"copius.jpg\"\r\n\r\n" . rtrim(chunk_split(base64_encode($img), 76, "\r\n")),
        ]);
        $type = "multipart/related; boundary=\"=_r$id\"; type=\"multipart/alternative\"";
    }
    if ($files) {
        $parts = ["Content-Type: $type\r\n\r\n" . $body];
        foreach ($files as [$fname, $ftype, $bytes]) {
            if (!preg_match('/^[A-Za-z0-9._-]+$/', $fname) || !preg_match('#^[a-z]+/[a-z0-9.+-]+$#', $ftype)) return null;
            $parts[] = "Content-Type: $ftype; name=\"$fname\"\r\nContent-Transfer-Encoding: base64\r\n" .
                "Content-Disposition: attachment; filename=\"$fname\"\r\n\r\n" . rtrim(chunk_split(base64_encode($bytes), 76, "\r\n"));
        }
        $body = mime_parts("=_m$id", $parts);
        $type = "multipart/mixed; boundary=\"=_m$id\"";
    }
    return [
        'to' => $to,
        'from' => $from,
        'subject' => mime_word($subject),
        'headers' => [
            'Date: ' . date('r'),
            'From: ' . mime_word($name) . " <$from>",
            "Reply-To: $reply",
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@copius.fr>',
            'MIME-Version: 1.0',
            "Content-Type: $type",
            'Auto-Submitted: auto-generated',
        ],
        'body' => $body,
    ];
}

function mime_parts(string $boundary, array $parts): string {
    return "--$boundary\r\n" . implode("\r\n--$boundary\r\n", $parts) . "\r\n--$boundary--\r\n";
}

/* The HTML part: tables and inline styles, the only layout every mail app
   keeps; the site's paper, ink and olive. Every word is escaped. Outlook for
   Windows (Word's engine) ignores max-width and padding on a link, and takes
   only the first font named: the [if mso] table fixes the card at 560 px,
   mso-padding-alt pads the button's cell, and each font stack starts with a
   font Windows has. */
function mail_html(array $t, string $lang, string $link, bool $banner): string {
    $e = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $l = $e($link);
    $serif = "font-family:Georgia,'Times New Roman',serif";
    $sans = 'font-family:Arial,Helvetica,sans-serif';
    $top = $banner
        ? '<tr><td style="padding:0"><img src="cid:banner@copius.fr" width="560" alt="' . $e($t['alt']) . '" ' .
          'style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px 8px 0 0"></td></tr>'
        : '<tr><td style="padding:32px 32px 0;' . $serif . ';font-size:30px;letter-spacing:.12em;color:#1E211A">COPIUS</td></tr>';
    return <<<HTML
<!doctype html>
<html lang="$lang"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{$e($t['subject'])}</title></head>
<body style="margin:0;padding:0;background:#F7F6F1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F6F1"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFEFC;border:1px solid #E5E7DA;border-radius:8px">
$top
<tr><td style="padding:28px 32px 4px;$serif;font-size:17px;line-height:1.6;color:#1E211A">
<p style="margin:0 0 12px">{$e($t['hello'])}</p>
<p style="margin:0 0 24px">{$e($t['lead'])}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#4F5B3F" style="border-radius:6px;background:#4F5B3F;mso-padding-alt:13px 28px">
<a href="$l" style="display:inline-block;padding:13px 28px;$sans;font-size:15px;font-weight:600;color:#FFFEFC;text-decoration:none;border-radius:6px">{$e($t['button'])}</a>
</td></tr></table>
<p style="margin:22px 0 0;font-size:15px;color:#565A4C">{$e($t['expiry'])}</p>
</td></tr>
<tr><td style="padding:20px 32px 0;$sans;font-size:13px;line-height:1.5;color:#6A6E5F">
<p style="margin:0 0 4px">{$e($t['copy'])}</p>
<p style="margin:0 0 16px;word-break:break-all"><a href="$l" style="color:#4F5B3F">$l</a></p>
<p style="margin:0">{$e($t['ignore'])}</p>
</td></tr>
<tr><td style="padding:24px 32px 30px;$serif;font-size:17px;color:#1E211A">{$e($t['bye'])}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:16px 0 0;$sans;font-size:12px;color:#6A6E5F">Copius · <a href="mailto:contact@copius.fr" style="color:#6A6E5F">contact@copius.fr</a></p>
</td></tr></table>
</body></html>
HTML;
}

/* One SMTP session. Null when the server took the message, else a short
   reason (a reply code or a stage name) that never holds a secret. */
function smtp_send(array $m, float $deadline): ?string {
    $s = cfg('smtp');
    $left = fn(): float => $deadline - microtime(true);
    if ($left() < 5) return 'no_time';
    $tls = ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $s['host'],
            'allow_self_signed' => false, 'SNI_enabled' => true];
    if (!empty($s['cafile'])) $tls['cafile'] = $s['cafile'];      // the rig's own test authority
    $fp = @stream_socket_client('ssl://' . $s['host'] . ':' . (int)$s['port'], $errno, $errstr,
        min(10.0, $left()), STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => $tls]));
    if (!$fp) return 'connect';
    /* Send one line (or none, for the greeting) and read the whole reply. */
    $say = function (?string $line, array $ok) use ($fp, $left): ?string {
        if ($line !== null && @fwrite($fp, $line . "\r\n") === false) return 'write';
        do {
            if ($left() < 1) return 'no_time';
            stream_set_timeout($fp, (int)max(1, min(10, $left())));
            $r = fgets($fp, 1024);
            if ($r === false) return 'read';
        } while (strlen($r) > 3 && $r[3] === '-');
        $code = (int)substr($r, 0, 3);
        return in_array($code, $ok, true) ? null : 'reply_' . $code;
    };
    $data = implode("\r\n", array_merge($m['headers'], ['To: <' . $m['to'] . '>', 'Subject: ' . $m['subject']])) .
        "\r\n\r\n" . $m['body'];
    $data = preg_replace('/^\./m', '..', $data);                   // dot-stuffing
    $steps = [
        [null, [220]],
        ['EHLO copius.fr', [250]],
        ['AUTH LOGIN', [334]],
        [base64_encode($s['user']), [334]],
        [base64_encode($s['pass']), [235]],
        ['MAIL FROM:<' . $m['from'] . '>', [250]],
        ['RCPT TO:<' . $m['to'] . '>', [250, 251]],
        ['DATA', [354]],
        [$data . "\r\n.", [250]],
    ];
    $err = null;
    foreach ($steps as $i => [$line, $ok]) {
        $err = $say($line, $ok);
        if ($err !== null) { $err = 'step' . $i . '_' . $err; break; }
    }
    if ($err === null) $say('QUIT', [221]);
    fclose($fp);
    return $err;
}

/* The rig's transport: the message goes to a file in copius-private, never
   anywhere else. Production's config.php never sets it. */
function mail_to_file(array $m): bool {
    $dir = PRIV . '/outbox';
    if (!is_dir($dir)) @mkdir($dir, 0700);
    return (bool)@file_put_contents($dir . '/' . date('His') . '-' . bin2hex(random_bytes(3)) . '.eml',
        implode("\r\n", array_merge($m['headers'], ['To: <' . $m['to'] . '>', 'Subject: ' . $m['subject']])) .
        "\r\n\r\n" . $m['body']);
}

/* Build and send one link; the outcome is a word for api.log. SMTP; on a
   refusal, one retry after about 60 s unless 60 s have already gone by, inside
   the 165 s execution limit. No other route: PHP's mail() would likely fail
   DMARC, and its bounces could land in a mailbox the privacy page cannot
   promise to empty; the reader asks for a new link instead. */
function send_link(string $to, string $lang, string $link, float $t0): string {
    $m = mail_message($to, $lang, $link);
    if ($m === null) return 'header_refused';
    if (cfg('transport') === 'file') return mail_to_file($m) ? 'sent_file' : 'file_failed';
    $deadline = $t0 + 140;
    /* A connection reset mid-session still raises a warning in fgets() or
       fwrite(): it counts as a refusal like any other, never as an escape. */
    $try = function () use ($m, $deadline): ?string {
        try { return smtp_send($m, $deadline); } catch (Throwable $e) { return 'exception'; }
    };
    $err = $try();
    if ($err === null) return 'sent';
    log_php('smtp ' . $err);
    if (microtime(true) - $t0 < 60) {
        sleep(60);
        $err = $try();
        if ($err === null) return 'sent_retry';
        log_php('smtp retry ' . $err);
    }
    return 'smtp_refused';
}
