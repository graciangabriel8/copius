<?php
/* The sign-in mail (DESIGN.md section 5) and the SMTP client that carries it.
   Hand-written rather than a mail library, so nothing is downloaded and every
   step has a hard limit:
   - implicit TLS to the mailbox's server, with the certificate and its name
     checked, and never a plaintext fallback;
   - AUTH only inside that TLS, and the password in no log and no error string;
   - every reply code checked, and the first unexpected one ends the session;
   - CR and LF refused in every header value before anything is written;
   - the body quoted-printable UTF-8 with CRLF endings, and dot-stuffed;
   - a timeout on the connect and on each read, inside the request's time. */
declare(strict_types=1);

const MAIL_TEXT = [
    'fr' => ["Votre lien de connexion à Copius",
             "Bonjour,\n\nVoici votre lien pour vous connecter à la version complète de Copius\u{00A0}:\n\n{link}\n\n" .
             "Il est valable 15 minutes et ne sert qu’une fois. Ouvrez-le sur l’appareil où vous lisez Copius.\n\n" .
             "Vous n’avez rien demandé\u{202F}? Ignorez ce message\u{00A0}: sans ce lien, personne ne peut se connecter à votre place.\n\n" .
             "Copius · contact@copius.fr\n"],
    'en' => ["Your Copius sign-in link",
             "Hello,\n\nHere is your link to sign in to the full version of Copius:\n\n{link}\n\n" .
             "It works once, within 15 minutes. Open it on the device where you read Copius.\n\n" .
             "Didn’t ask for this? Ignore this email: without the link, nobody can sign in as you.\n\n" .
             "Copius · contact@copius.fr\n"],
];

function header_safe(string ...$values): bool {
    foreach ($values as $v) if (preg_match('/[\r\n\0]/', $v)) return false;
    return true;
}

/* RFC 2047 for anything that is not plain ASCII. */
function mime_word(string $s): string {
    return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/* The message, or null when any header value carries a line break or the
   address is not the plain ASCII one the grant holds. */
function mail_message(string $to, string $lang, string $link): ?array {
    [$subject, $text] = MAIL_TEXT[$lang] ?? MAIL_TEXT['fr'];
    $from = (string)cfg('from'); $name = (string)cfg('from_name'); $reply = (string)cfg('reply_to');
    if (!header_safe($to, $from, $name, $reply, $subject, $link)) return null;
    if (!preg_match('/^[\x21-\x7e]+@[\x21-\x7e]+$/', $to) || strpbrk($to, '<>,;"()[]\\') !== false) return null;
    $body = str_replace("\n", "\r\n", str_replace('{link}', $link, $text));
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
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            'Auto-Submitted: auto-generated',
        ],
        'body' => quoted_printable_encode($body),
    ];
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

/* PHP's mail(), for one message when SMTP has refused twice. It will likely
   fail DMARC and land in spam, which still beats nothing (section 3). The
   envelope sender is the sender mailbox, so bounces come back there. */
function mail_fallback(array $m): bool {
    return @mail($m['to'], $m['subject'], $m['body'], implode("\r\n", $m['headers']), '-f' . $m['from']);
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

/* Build and send one link; the outcome is a word for api.log. SMTP first; on a
   refusal, one retry after about 60 s unless 60 s have already gone by, then
   mail() unless 140 s have, all inside the 165 s execution limit. */
function send_link(string $to, string $lang, string $link, float $t0): string {
    $m = mail_message($to, $lang, $link);
    if ($m === null) return 'header_refused';
    if (cfg('transport') === 'file') return mail_to_file($m) ? 'sent_file' : 'file_failed';
    if (cfg('mail_test')) return mail_fallback($m) ? 'sent_mail_test' : 'mail_test_failed';
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
    if (microtime(true) - $t0 < 140 && mail_fallback($m)) return 'smtp_refused_mail';
    return 'smtp_refused';
}
