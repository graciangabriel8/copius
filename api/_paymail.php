<?php
/* The payment mails (DESIGN-PAYMENT.md section 6), built when the outbox sends
   them: one word set per language, and one layout, the sign-in mail's, from
   which both the plain text and the HTML are made. French spacing before
   « : ; ? ! » and inside guillemets is added by nb(), so the words below are
   typed with plain spaces. */
declare(strict_types=1);

const PAY_TEXT = [
    'fr' => [
        'hello' => 'Bonjour,',
        'plan_monthly' => 'Version complète de Copius — formule mensuelle : 4,90 € par mois, sans durée minimale, renouvelée chaque mois jusqu’à résiliation.',
        'plan_yearly' => 'Version complète de Copius — formule annuelle : 39 € pour un an, engagement d’un an, reconduite chaque année sauf refus de votre part.',
        'submit_monthly' => '4,90 € par mois, sans durée minimale, renouvelé chaque mois jusqu’à résiliation. Vous pouvez vous rétracter pendant 14 jours.',
        'submit_yearly' => '39 € pour un an, engagement d’un an, reconduit chaque année sauf refus de votre part. Vous pouvez vous rétracter pendant 14 jours.',
        'vat' => 'TVA non applicable, article 293 B du CGI',
        'signin' => 'Me connecter',
        'signin_note' => 'Ce lien vaut 15 minutes et ne sert qu’une fois. Ensuite, demandez-en un nouveau sur copius.fr avec cette adresse.',
        'confirm_subject' => 'Votre abonnement à Copius est confirmé',
        'confirm_lead' => 'Merci : votre abonnement à la version complète de Copius est confirmé. Voici ce que vous avez souscrit.',
        'ref' => 'Référence de l’abonnement',
        'price_paid' => 'Prix payé',
        'start' => 'Début',
        'next' => 'Prochain paiement',
        'accepted' => 'Conditions générales de vente acceptées le {at}, version du {v}',
        'year_one' => 'La première année est un engagement ferme : une résiliation pendant cette année prend effet à sa fin. Avant chaque reconduction, nous vous écrivons, entre trois mois et un mois avant la date limite, pour vous rappeler que vous pouvez la refuser.',
        'withdraw' => 'Droit de rétractation : vous pouvez vous rétracter jusqu’au {d} inclus, sans motif et sans frais, avec la fonction « Renoncer au contrat ici » ({u}), ou en nous envoyant le formulaire de rétractation qui figure à la fin des conditions ci-dessous. Nous vous remboursons alors la totalité du prix payé.',
        'cancel_any' => 'Vous pouvez résilier à tout moment avec la fonction « Résilier votre contrat » ({u}), avec la référence ci-dessus.',
        'keep' => 'Conservez cet e-mail : c’est l’archive de votre contrat. Les conditions générales de vente que vous avez acceptées suivent.',
        'cgv_title' => 'Conditions générales de vente',
        'cgv_en' => '',
        'already_subject' => 'Vous êtes déjà abonné à Copius',
        'already_lead' => 'Quelqu’un, sans doute vous, a voulu souscrire un abonnement à Copius avec cette adresse, qui en a déjà un en cours (référence {r}). Aucun nouvel abonnement n’a été créé et rien n’a été prélevé.',
        'failed_subject' => 'Le paiement de votre abonnement Copius n’a pas abouti',
        'failed_lead' => 'Le paiement de {a} pour le renouvellement de votre abonnement (référence {r}) n’a pas abouti. Nous le tenterons à nouveau dans les prochains jours.',
        'failed_keep' => 'Vous gardez l’accès à la version complète jusqu’au {d}. Sans paiement d’ici là, l’abonnement prend fin, sans aucun frais.',
        'failed_pay' => 'Payer avec une autre carte',
        'cack_subject' => 'Accusé de réception de votre résiliation',
        'cack_lead' => 'Nous avons bien reçu, le {at}, votre demande de résiliation :',
        'name' => 'Nom',
        'email' => 'Adresse e-mail',
        'wish' => 'Date de fin demandée',
        'wish_period_end' => 'à la fin de la période en cours',
        'wish_early' => 'le {d}',
        'motif' => 'Motif indiqué',
        'cack_end' => 'Votre abonnement prend fin le {d}. Jusque-là, vous gardez l’accès à la version complète ; ensuite, seule la version gratuite reste accessible. Aucun paiement ne sera plus prélevé.',
        'cack_year' => 'Pendant la première année de la formule annuelle, la résiliation prend effet à la fin de cette année (article 9.3 des conditions générales de vente).',
        'cack_late' => 'La date demandée n’était pas possible (au plus tard 10 jours après votre demande, avant la fin de la période payée) : la résiliation prend effet à la fin de la période en cours.',
        'cack_motif' => 'Vous avez indiqué un motif : nous l’examinons et revenons vers vous par e-mail.',
        'refund' => 'Nous vous remboursons {a} sur votre carte au plus tard le {d}.',
        'ended' => 'Cet abonnement avait déjà pris fin : aucun paiement ne sera plus prélevé.',
        'nomatch' => 'Nous n’avons pas pu rapprocher cette référence et cette adresse d’un abonnement. Vérifiez la référence, qui figure dans l’e-mail de confirmation, ou écrivez-nous à contact@copius.fr : votre demande reste enregistrée à la date ci-dessus.',
        'wack_subject' => 'Accusé de réception de votre rétractation',
        'wack_lead' => 'Nous avons bien reçu votre rétractation, envoyée le {at} :',
        'wack_text' => 'Je vous notifie par la présente ma rétractation du contrat d’abonnement à la version complète de Copius, référence {r}.',
        'wack_done' => 'Votre accès à la version complète est fermé et aucun paiement ne sera plus prélevé.',
        'wack_late' => 'Le délai de rétractation de cet abonnement a pris fin le {d} : votre demande ne peut donc pas valoir rétractation. Pour mettre fin à l’abonnement, utilisez la fonction « Résilier votre contrat » ({u}). Une question : contact@copius.fr.',
        'notice_subject' => 'Votre abonnement annuel à Copius sera reconduit le {d}',
        'notice_box' => 'Date limite pour refuser la reconduction : {d}',
        'notice_text' => 'Votre abonnement annuel à la version complète de Copius (référence {r}) sera reconduit pour un an le {renew}, au prix de {a} ({vat}). Si vous ne souhaitez pas le reconduire, utilisez la fonction « Résilier votre contrat » avant la date limite ci-dessus : {u}. Sans refus de votre part, votre carte sera débitée le {renew}.',
        'bye' => 'Bonne lecture, et bonne cuisine.',
        'seller' => 'Copius · Gabriel Gracian-Leroudier, entrepreneur individuel (Nokime) · 21 rue des Docteurs Charcot, 42100 Saint-Étienne · SIREN 130 694 615 · contact@copius.fr',
        'months' => ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    ],
    'en' => [
        'hello' => 'Hello,',
        'plan_monthly' => 'Copius full version, monthly plan: €4.90 a month, no minimum term, renewed each month until you cancel.',
        'plan_yearly' => 'Copius full version, yearly plan: €39 for a year, a one-year commitment, renewed each year unless you refuse.',
        'submit_monthly' => '€4.90 a month, no minimum term, renewed each month until you cancel. You may withdraw within 14 days.',
        'submit_yearly' => '€39 for a year, a one-year commitment, renewed each year unless you refuse. You may withdraw within 14 days.',
        'vat' => 'VAT not applicable, article 293 B of the French tax code',
        'signin' => 'Sign me in',
        'signin_note' => 'This link works once, within 15 minutes. After that, ask for a new one on copius.fr with this address.',
        'confirm_subject' => 'Your Copius subscription is confirmed',
        'confirm_lead' => 'Thank you: your subscription to the full version of Copius is confirmed. Here is what you subscribed to.',
        'ref' => 'Subscription reference',
        'price_paid' => 'Price paid',
        'start' => 'Start',
        'next' => 'Next payment',
        'accepted' => 'Terms of sale accepted on {at}, version of {v}',
        'year_one' => 'The first year is a firm commitment: cancelling during it takes effect at its end. Before each renewal we write to you, between three months and one month before the deadline, to remind you that you can refuse it.',
        'withdraw' => 'Right of withdrawal: you may withdraw until {d} inclusive, without giving a reason and at no cost, with the « Renoncer au contrat ici » (withdraw from the contract) function ({u}), or by sending us the withdrawal form at the end of the terms below. We then refund the full price paid.',
        'cancel_any' => 'You can cancel at any time with the « Résilier votre contrat » (cancel your contract) function ({u}), using the reference above.',
        'keep' => 'Keep this email: it is the record of your contract. The terms of sale you accepted follow, in French, which is the binding text.',
        'cgv_title' => 'Conditions générales de vente (French, binding)',
        'cgv_en' => 'Terms of sale, English translation (for information only)',
        'already_subject' => 'You already subscribe to Copius',
        'already_lead' => 'Someone, most likely you, tried to subscribe to Copius with this address, which already has a subscription running (reference {r}). No new subscription was created and nothing was charged.',
        'failed_subject' => 'The payment for your Copius subscription did not go through',
        'failed_lead' => 'The payment of {a} renewing your subscription (reference {r}) did not go through. We will try again over the next few days.',
        'failed_keep' => 'You keep the full version until {d}. Without a payment by then, the subscription ends, at no cost.',
        'failed_pay' => 'Pay with another card',
        'cack_subject' => 'Your cancellation: acknowledgement of receipt',
        'cack_lead' => 'We received your cancellation request on {at}:',
        'name' => 'Name',
        'email' => 'Email address',
        'wish' => 'End date requested',
        'wish_period_end' => 'at the end of the current period',
        'wish_early' => 'on {d}',
        'motif' => 'Reason given',
        'cack_end' => 'Your subscription ends on {d}. Until then you keep the full version; after that, only the free version remains. No further payment will be taken.',
        'cack_year' => 'During the first year of the yearly plan, cancelling takes effect at the end of that year (article 9.3 of the terms of sale).',
        'cack_late' => 'The date requested was not possible (at most 10 days after your request, before the paid period ends): the cancellation takes effect at the end of the current period.',
        'cack_motif' => 'You gave a reason: we are looking into it and will reply by email.',
        'refund' => 'We will refund {a} to your card by {d} at the latest.',
        'ended' => 'This subscription had already ended: no further payment will be taken.',
        'nomatch' => 'We could not match this reference and this address to a subscription. Check the reference, which is in the confirmation email, or write to contact@copius.fr: your request stays on record at the date above.',
        'wack_subject' => 'Your withdrawal: acknowledgement of receipt',
        'wack_lead' => 'We received your withdrawal, sent on {at}:',
        'wack_text' => 'I hereby give notice that I withdraw from the subscription contract for the full version of Copius, reference {r}.',
        'wack_done' => 'Your access to the full version is closed and no further payment will be taken.',
        'wack_late' => 'The withdrawal period for this subscription ended on {d}, so your request cannot count as a withdrawal. To end the subscription, use the « Résilier votre contrat » (cancel your contract) function ({u}). Any question: contact@copius.fr.',
        'notice_subject' => 'Your yearly Copius subscription renews on {d}',
        'notice_box' => 'Deadline to refuse the renewal: {d}',
        'notice_text' => 'Your yearly subscription to the full version of Copius (reference {r}) will renew for one year on {renew}, at {a} ({vat}). If you do not want it renewed, use the « Résilier votre contrat » (cancel your contract) function before the deadline above: {u}. Unless you refuse, your card will be charged on {renew}.',
        'bye' => 'Happy reading, and happy cooking.',
        'seller' => 'Copius · Gabriel Gracian-Leroudier, sole trader (Nokime) · 21 rue des Docteurs Charcot, 42100 Saint-Étienne, France · SIREN 130 694 615 · contact@copius.fr',
        'months' => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ],
];

/* French spacing: a no-break space before a colon, a narrow one before ; ? !
   and inside guillemets. Plain spaces only, so URLs are never touched. */
function nb(string $s, string $lang): string {
    if ($lang !== 'fr') return $s;
    return strtr($s, [' :' => "\u{00A0}:", ' ;' => "\u{202F};", ' ?' => "\u{202F}?", ' !' => "\u{202F}!",
        '« ' => "«\u{202F}", ' »' => "\u{202F}»", ' €' => "\u{00A0}€"]);
}

function fmt_date(string $d, string $lang): string {
    $t = strtotime($d);
    $m = PAY_TEXT[$lang]['months'][(int)date('n', $t) - 1];
    return $lang === 'fr' ? (date('j', $t) === '1' ? '1er' : date('j', $t)) . " $m " . date('Y', $t) : "$m " . date('j, Y', $t);
}

function fmt_at(int $ts, string $lang): string {
    return fmt_date(date('Y-m-d', $ts), $lang) . ($lang === 'fr' ? ' à ' . date('G', $ts) . ' h ' . date('i', $ts) : ' at ' . date('H:i', $ts) . ' (Paris)');
}

function fmt_money(int $cents, string $lang): string {
    $n = number_format($cents / 100, $cents % 100 ? 2 : 0, $lang === 'fr' ? ',' : '.', '');
    return $lang === 'fr' ? "$n €" : "€$n";
}

/* The message for one outbox row, or null when it cannot be built (a header
   value with a line break, a CGV file missing). */
function pay_mail(array $row): ?array {
    $lang = $row['lang'] === 'en' ? 'en' : 'fr';
    $t = PAY_TEXT[$lang];
    $p = json_decode((string)$row['payload'], true) ?: [];
    $f = fn(string $k, array $v = []): string => nb(strtr($t[$k], $v), $lang);
    $o = (string)cfg('origin');
    $b = [];   // blocks: [p, text] [box, lines] [btn, label, url] [small, text] [pre, title, text]
    switch ($row['kind']) {
    case 'confirm':
        $subject = $t['confirm_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('confirm_lead')];
        $b[] = ['box', [
            $f('ref') . nb(' : ', $lang) . $row['ref'],
            $f('plan_' . $p['plan']),
            $f('price_paid') . nb(' : ', $lang) . nb(fmt_money((int)$p['cents'], $lang), $lang) . ' (' . $t['vat'] . ')',
            $f('start') . nb(' : ', $lang) . fmt_date($p['started'], $lang),
            $f('next') . nb(' : ', $lang) . fmt_date($p['next'], $lang) . ', ' . nb(fmt_money(PLANS[$p['plan']]['cents'], $lang), $lang),
            $f('accepted', ['{at}' => fmt_at((int)$p['cgv_at'], $lang), '{v}' => fmt_date((string)$p['cgv'], $lang)]),
        ]];
        if ($p['plan'] === 'yearly') $b[] = ['p', $f('year_one')];
        $b[] = ['p', $f('withdraw', ['{d}' => fmt_date(withdraw_deadline($p['started']), $lang), '{u}' => "$o/renoncer/"])];
        $b[] = ['p', $f('cancel_any', ['{u}' => "$o/resilier/"])];
        $b[] = ['btn', $t['signin'], signin_link((string)$row['to_addr'], $lang)];
        $b[] = ['small', $f('signin_note')];
        $b[] = ['p', $f('keep')];
        $cgv = @file_get_contents(__DIR__ . '/_cgv/' . basename((string)$p['cgv']) . '-fr.txt');
        if (!is_string($cgv) || trim($cgv) === '') return null;
        $b[] = ['pre', $t['cgv_title'], $cgv];
        if ($lang === 'en') {
            $en = @file_get_contents(__DIR__ . '/_cgv/' . basename((string)$p['cgv']) . '-en.txt');
            if (is_string($en) && trim($en) !== '') $b[] = ['pre', $t['cgv_en'], $en];
        }
        break;
    case 'already':
        $subject = $t['already_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('already_lead', ['{r}' => $p['ref']])];
        $b[] = ['btn', $t['signin'], signin_link((string)$row['to_addr'], $lang)];
        $b[] = ['small', $f('signin_note')];
        break;
    case 'failed':
        $subject = $t['failed_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('failed_lead', ['{a}' => nb(fmt_money((int)$p['cents'], $lang), $lang), '{r}' => $p['ref']])];
        $b[] = ['p', $f('failed_keep', ['{d}' => fmt_date($p['until'], $lang)])];
        if (preg_match('#^https://[\x21-\x7e]+$#', (string)($p['pay'] ?? ''))) $b[] = ['btn', $t['failed_pay'], $p['pay']];
        break;
    case 'cancel_ack':
        $subject = $t['cack_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('cack_lead', ['{at}' => fmt_at((int)$p['at'], $lang)])];
        $wish = $p['choice'] === 'early' && $p['date'] ? $f('wish_early', ['{d}' => fmt_date($p['date'], $lang)]) : $t['wish_period_end'];
        $lines = [$t['name'] . nb(' : ', $lang) . $p['name'], $t['email'] . nb(' : ', $lang) . $row['to_addr'],
                  $t['ref'] . nb(' : ', $lang) . $p['ref'], $t['wish'] . nb(' : ', $lang) . $wish];
        if ($p['motif'] !== '') $lines[] = $t['motif'] . nb(' : ', $lang) . $p['motif'];
        $b[] = ['box', $lines];
        if (!$p['matched']) { $b[] = ['p', $f('nomatch')]; break; }
        if ($p['outcome'] === 'ended_already') { $b[] = ['p', $f('ended')]; break; }
        $b[] = ['p', $f('cack_end', ['{d}' => fmt_date((string)$p['end'], $lang)])];
        if ($p['applied'] === 'year_end') {
            $b[] = ['p', $f('cack_year')];
            if ($p['motif'] !== '') $b[] = ['p', $f('cack_motif')];
        } elseif ($p['choice'] === 'early' && $p['applied'] !== 'early') {
            $b[] = ['p', $f('cack_late')];
        }
        if ((int)$p['refund'] > 0) $b[] = ['p', $f('refund', ['{a}' => nb(fmt_money((int)$p['refund'], $lang), $lang),
            '{d}' => fmt_date(add_days((string)$p['end'], 14), $lang)])];
        break;
    case 'withdraw_ack':
        $subject = $t['wack_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('wack_lead', ['{at}' => fmt_at((int)$p['at'], $lang)])];
        $b[] = ['box', [$f('wack_text', ['{r}' => $p['ref']]), $t['name'] . nb(' : ', $lang) . $p['name'],
                        $t['email'] . nb(' : ', $lang) . $row['to_addr']]];
        if (!$p['matched']) { $b[] = ['p', $f('nomatch')]; break; }
        if ($p['outcome'] === 'out_of_time') {
            $b[] = ['p', $f('wack_late', ['{d}' => fmt_date((string)$p['deadline'], $lang), '{u}' => "$o/resilier/"])];
            break;
        }
        $b[] = ['p', $f('wack_done')];
        if ((int)$p['refund'] > 0) $b[] = ['p', $f('refund', ['{a}' => nb(fmt_money((int)$p['refund'], $lang), $lang),
            '{d}' => fmt_date(add_days(date('Y-m-d', (int)$p['at']), 14), $lang)])];
        break;
    case 'notice':
        $subject = $f('notice_subject', ['{d}' => fmt_date($p['renews'], $lang)]);
        $b[] = ['p', $t['hello']];
        $b[] = ['box', [$f('notice_box', ['{d}' => fmt_date($p['deadline'], $lang)])]];
        $b[] = ['p', $f('notice_text', ['{r}' => $p['ref'], '{renew}' => fmt_date($p['renews'], $lang),
            '{a}' => nb(fmt_money((int)$p['cents'], $lang), $lang), '{vat}' => $t['vat'], '{u}' => "$o/resilier/"])];
        break;
    case 'alert':
        $subject = 'Copius: ' . mb_substr(strtok((string)$p['text'], "\n.:"), 0, 70);
        $text = $p['text'] . "\n";
        return mail_build((string)$row['to_addr'], $subject, $text, fn(bool $banner): string =>
            '<!doctype html><html><body><pre style="font:14px/1.5 monospace;white-space:pre-wrap">' .
            htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</pre></body></html>');
    default:
        return null;
    }
    $b[] = ['p', $t['bye']];
    return mail_build((string)$row['to_addr'], nb($subject, $lang), blocks_text($b, $t['seller'], $lang),
        fn(bool $banner): string => blocks_html($b, $lang, nb($subject, $lang), $t['seller'], $banner));
}

function blocks_text(array $blocks, string $seller, string $lang): string {
    $out = [];
    foreach ($blocks as $bl) {
        $out[] = match ($bl[0]) {
            'p', 'small' => $bl[1],
            'box' => implode("\n", $bl[1]),
            'btn' => $bl[1] . nb(' : ', $lang) . $bl[2],
            'pre' => "———— {$bl[1]} ————\n\n" . trim($bl[2]),
        };
    }
    return implode("\n\n", $out) . "\n\n" . $seller . "\n";
}

/* The sign-in mail's frame (mail_html): the same card, colours and Outlook
   fixes, holding paragraphs, a framed box, a button and the CGV. */
function blocks_html(array $blocks, string $lang, string $subject, string $seller, bool $banner): string {
    $e = fn(string $s): string => nl2br(htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8'), false);
    /* Copius's own words only: an address in them becomes a link (never in a
       box, which quotes what the reader typed). */
    $linked = fn(string $s): string => preg_replace('#https?://[A-Za-z0-9./:_-]+#', '<a href="$0" style="color:#4F5B3F">$0</a>', $e($s));
    $serif = "font-family:Georgia,'Times New Roman',serif";
    $sans = 'font-family:Arial,Helvetica,sans-serif';
    $top = $banner
        ? '<tr><td style="padding:0"><img src="cid:banner@copius.fr" width="560" alt="Copius" ' .
          'style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px 8px 0 0"></td></tr>'
        : '<tr><td style="padding:32px 32px 0;' . $serif . ';font-size:30px;letter-spacing:.12em;color:#1E211A">COPIUS</td></tr>';
    $rows = '';
    foreach ($blocks as $bl) {
        $rows .= match ($bl[0]) {
            'p' => '<p style="margin:0 0 16px">' . $linked($bl[1]) . '</p>',
            'small' => '<p style="margin:0 0 16px;' . $sans . ';font-size:13px;line-height:1.5;color:#6A6E5F">' . $e($bl[1]) . '</p>',
            'box' => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">' .
                '<tr><td style="padding:14px 18px;border:1px solid #CBD0BB;border-radius:6px;background:#F7F6F1;' . $sans .
                ';font-size:14px;line-height:1.6;color:#1E211A">' . implode('<br>', array_map($e, $bl[1])) . '</td></tr></table>',
            'btn' => '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 14px"><tr>' .
                '<td bgcolor="#4F5B3F" style="border-radius:6px;background:#4F5B3F;mso-padding-alt:13px 28px">' .
                '<a href="' . htmlspecialchars($bl[2], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" style="display:inline-block;padding:13px 28px;' .
                $sans . ';font-size:15px;font-weight:600;color:#FFFEFC;text-decoration:none;border-radius:6px">' . $e($bl[1]) . '</a></td></tr></table>',
            'pre' => '<p style="margin:28px 0 8px;' . $sans . ';font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#6A6E5F">' .
                $e($bl[1]) . '</p><div style="' . $sans . ';font-size:12.5px;line-height:1.55;color:#3A3D33;white-space:pre-wrap">' .
                htmlspecialchars(trim($bl[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</div>',
        };
    }
    $l = htmlspecialchars($lang, ENT_QUOTES);
    return <<<HTML
<!doctype html>
<html lang="$l"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{$e($subject)}</title></head>
<body style="margin:0;padding:0;background:#F7F6F1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F6F1"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFEFC;border:1px solid #E5E7DA;border-radius:8px">
$top
<tr><td style="padding:28px 32px 18px;$serif;font-size:16px;line-height:1.6;color:#1E211A">$rows</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:16px 0 0;max-width:560px;$sans;font-size:12px;line-height:1.5;color:#6A6E5F">{$e($seller)}</p>
</td></tr></table>
</body></html>
HTML;
}
