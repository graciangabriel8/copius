<?php
/* The payment mails (DESIGN-PAYMENT.md section 6), built when the outbox sends
   them: one word set per language, and one layout, the sign-in mail's, from
   which both the plain text and the HTML are made. French spacing before
   « : ; ? ! » and inside guillemets is added by nb(), so the words below are
   typed with plain spaces. A request that matched no subscription is answered
   without repeating anything its sender typed but the reference, so the forms
   cannot carry a stranger's words to anyone. */
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
        'signin_note' => 'Ce lien est valable 15 minutes et ne sert qu’une fois. Ensuite, demandez-en un nouveau sur copius.fr avec cette adresse.',
        'confirm_subject' => 'Copius : confirmation de votre abonnement',
        'confirm_lead' => 'Merci : votre abonnement à la version complète de Copius est confirmé. Connectez-vous pour y accéder dès maintenant.',
        'confirm_box' => 'Ce que vous avez souscrit :',
        'ref' => 'Référence de l’abonnement',
        'price_paid' => 'Prix payé',
        'start' => 'Début',
        'next' => 'Prochain paiement',
        'accepted' => 'Conditions générales de vente acceptées le {at}, version du {v}',
        'year_one' => 'La première année est un engagement ferme : une résiliation pendant cette année prend effet à sa fin. Avant chaque reconduction, nous vous écrivons, entre trois mois et un mois avant la date limite, pour vous rappeler que vous pouvez la refuser.',
        'withdraw' => 'Vous pouvez vous rétracter jusqu’au {d} inclus, sans motif : fonction [[« Renoncer au contrat ici »|{u}]], formulaire de rétractation à la fin des conditions jointes, ou message à contact@copius.fr. Vous serez intégralement remboursé sous 14 jours.',
        'cancel_any' => 'Vous pouvez résilier à tout moment avec la fonction [[« Résilier votre contrat »|{u}]].',
        'claims' => 'Une réclamation : écrivez à contact@copius.fr ou à Gabriel Gracian-Leroudier, 21 rue des Docteurs Charcot, 42100 Saint-Étienne. Si elle n’aboutit pas, vous pouvez saisir gratuitement le médiateur de la consommation : CM2C, 49 rue de Ponthieu, 75008 Paris, [[cm2c.net|https://www.cm2c.net]].',
        'keep' => 'Vos conditions générales de vente sont jointes en PDF : téléchargez-les et conservez-les. Cet e-mail est l’archive de votre contrat.',
        'already_subject' => 'Copius : vous êtes déjà abonné',
        'already_lead' => 'Quelqu’un, sans doute vous, a voulu souscrire un abonnement à Copius avec cette adresse, qui en a déjà un en cours (référence {r}). Aucun nouvel abonnement n’a été créé et rien n’a été prélevé.',
        'already_signin' => 'Pour vous connecter, demandez un lien sur copius.fr avec cette adresse. Une question : contact@copius.fr.',
        'failed_subject' => 'Copius : le paiement de votre abonnement n’a pas abouti',
        'failed_lead' => 'Le paiement de {a} pour le renouvellement de votre abonnement (référence {r}) n’a pas abouti. Nous le tenterons à nouveau dans les prochains jours.',
        'failed_keep' => 'Vous gardez l’accès à la version complète jusqu’au {d}. Sans paiement d’ici là, l’abonnement prend fin, sans aucun frais.',
        'failed_pay' => 'Payer avec une autre carte',
        'cack_subject' => 'Copius : accusé de réception de votre résiliation',
        'cack_lead' => 'Nous avons bien reçu, le {at}, votre demande de résiliation :',
        'cack_lead_nomatch' => 'Nous avons bien reçu, le {at}, une demande de résiliation pour la référence {r}, envoyée avec cette adresse.',
        'name' => 'Nom',
        'email' => 'Adresse e-mail',
        'wish' => 'Date de fin demandée',
        'wish_period_end' => 'à la fin de la période en cours',
        'wish_early' => 'le {d}',
        'motif' => 'Motif indiqué',
        'cack_end' => 'Votre abonnement prend fin le {d}. Jusque-là, vous gardez l’accès à la version complète ; ensuite, seule la version gratuite reste accessible. Aucun paiement ne sera plus prélevé.',
        'cack_now' => 'La période payée étant terminée et la suivante pas encore payée, votre abonnement prend fin aujourd’hui, le {d} : aucun paiement ne sera plus prélevé, et seule la version gratuite reste accessible.',
        'cack_year' => 'Pendant la première année de la formule annuelle, la résiliation prend effet à la fin de cette année (article 9.3 des conditions générales de vente).',
        'cack_late' => 'La date demandée n’était pas possible (au plus tard 10 jours après votre demande, avant la fin de la période payée) : la résiliation prend effet à la fin de la période en cours.',
        'cack_motif' => 'Vous avez indiqué un motif : nous l’examinons et revenons vers vous par e-mail. Pensez à envoyer le justificatif à contact@copius.fr ou par courrier à Gabriel Gracian-Leroudier, 21 rue des Docteurs Charcot, 42100 Saint-Étienne.',
        'cack_already' => 'Une résiliation de cet abonnement était déjà enregistrée : il prend fin le {d}, comme indiqué alors. Pour changer cette date, écrivez à contact@copius.fr.',
        'cack_already_open' => 'Une résiliation de cet abonnement était déjà enregistrée : son accusé de réception vous donne la date de fin. Pour la changer, écrivez à contact@copius.fr.',
        'refund' => 'Nous vous remboursons {a} sur votre carte au plus tard le {d}.',
        'ended' => 'Cet abonnement avait déjà pris fin : aucun paiement ne sera plus prélevé.',
        'nomatch' => 'Nous n’avons pas pu rapprocher cette référence et cette adresse d’un abonnement. Vérifiez la référence, qui figure dans l’e-mail de confirmation, ou écrivez-nous à contact@copius.fr : votre demande reste enregistrée à la date ci-dessus.',
        'wack_subject' => 'Copius : accusé de réception de votre rétractation',
        'wack_lead' => 'Nous avons bien reçu votre rétractation, envoyée le {at} :',
        'wack_lead_nomatch' => 'Nous avons bien reçu, le {at}, une rétractation pour la référence {r}, envoyée avec cette adresse.',
        'wack_text' => 'Je vous notifie par la présente ma rétractation du contrat d’abonnement à la version complète de Copius, référence {r}.',
        'wack_done' => 'Votre accès à la version complète est fermé et aucun paiement ne sera plus prélevé.',
        'wack_late' => 'Le délai de rétractation de cet abonnement a pris fin le {d} : votre demande ne peut donc pas valoir rétractation. Pour mettre fin à l’abonnement, utilisez la fonction « Résilier votre contrat » ({u}). Une question : contact@copius.fr.',
        'notice_subject' => 'Copius : votre abonnement annuel sera reconduit le {d}',
        'notice_box' => 'Date limite pour refuser la reconduction : {d}',
        'notice_text' => 'Votre abonnement annuel à la version complète de Copius (référence {r}) sera reconduit pour un an le {renew}, au prix de {a} ({vat}). Si vous ne souhaitez pas le reconduire, utilisez la fonction « Résilier votre contrat » avant la date limite ci-dessus : {u}. Sans refus de votre part, votre carte sera débitée le {renew}.',
        'bye' => 'Bonne lecture, et bonne cuisine.',
        'seller' => 'Copius · Gabriel Gracian-Leroudier, entrepreneur individuel (Nokime) · 21 rue des Docteurs Charcot, 42100 Saint-Étienne · SIREN 130 694 615, RCS Saint-Étienne · contact@copius.fr',
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
        'signin_note' => 'This link is valid once, for 15 minutes. After that, ask for a new one on copius.fr with this address.',
        'confirm_subject' => 'Copius: your subscription is confirmed',
        'confirm_lead' => 'Thank you: your subscription to the full version of Copius is confirmed. Sign in to use it right away.',
        'confirm_box' => 'What you subscribed to:',
        'ref' => 'Subscription reference',
        'price_paid' => 'Price paid',
        'start' => 'Start',
        'next' => 'Next payment',
        'accepted' => 'Terms of sale accepted on {at}, version of {v}',
        'year_one' => 'The first year is a firm commitment: cancelling during it takes effect at its end. Before each renewal we write to you, between three months and one month before the deadline, to remind you that you can refuse it.',
        'withdraw' => 'You may withdraw until {d} inclusive, without giving a reason: the [[“Withdraw from contract here”|{u}]] function, the withdrawal form at the end of the attached terms, or a message to contact@copius.fr. You will be refunded in full within 14 days.',
        'cancel_any' => 'You can cancel at any time with the [[“Cancel your contract”|{u}]] function.',
        'claims' => 'A complaint? Write to contact@copius.fr or to Gabriel Gracian-Leroudier, 21 rue des Docteurs Charcot, 42100 Saint-Étienne, France. If that does not settle it, you may turn, free of charge, to the consumer mediator: CM2C, 49 rue de Ponthieu, 75008 Paris, [[cm2c.net|https://www.cm2c.net]].',
        'keep' => 'Your terms of sale are attached as a PDF, in French, the binding text: download and keep them. This email is the record of your contract.',
        'already_subject' => 'Copius: you already subscribe',
        'already_lead' => 'Someone, most likely you, tried to subscribe to Copius with this address, which already has a subscription running (reference {r}). No new subscription was created and nothing was charged.',
        'already_signin' => 'To sign in, ask for a link on copius.fr with this address. Any question: contact@copius.fr.',
        'failed_subject' => 'Copius: the payment for your subscription did not go through',
        'failed_lead' => 'The payment of {a} renewing your subscription (reference {r}) did not go through. We will try again over the next few days.',
        'failed_keep' => 'You keep the full version until {d}. Without a payment by then, the subscription ends, at no cost.',
        'failed_pay' => 'Pay with another card',
        'cack_subject' => 'Copius: acknowledgement of your cancellation',
        'cack_lead' => 'We received your cancellation request on {at}:',
        'cack_lead_nomatch' => 'We received, on {at}, a cancellation request for reference {r}, sent with this address.',
        'name' => 'Name',
        'email' => 'Email address',
        'wish' => 'End date requested',
        'wish_period_end' => 'at the end of the current period',
        'wish_early' => 'on {d}',
        'motif' => 'Reason given',
        'cack_end' => 'Your subscription ends on {d}. Until then you keep the full version; after that, only the free version remains. No further payment will be taken.',
        'cack_now' => 'As the paid period is over and the next one is not paid yet, your subscription ends today, {d}: no further payment will be taken, and only the free version remains.',
        'cack_year' => 'During the first year of the yearly plan, cancelling takes effect at the end of that year (article 9.3 of the terms of sale).',
        'cack_late' => 'The date requested was not possible (at most 10 days after your request, before the paid period ends): the cancellation takes effect at the end of the current period.',
        'cack_motif' => 'You gave a reason: we are looking into it and will reply by email. Remember to send the supporting document to contact@copius.fr or by post to Gabriel Gracian-Leroudier, 21 rue des Docteurs Charcot, 42100 Saint-Étienne, France.',
        'cack_already' => 'A cancellation of this subscription was already recorded: it ends on {d}, as stated then. To change that date, write to contact@copius.fr.',
        'cack_already_open' => 'A cancellation of this subscription was already recorded: its acknowledgement gives you the end date. To change it, write to contact@copius.fr.',
        'refund' => 'We will refund {a} to your card by {d} at the latest.',
        'ended' => 'This subscription had already ended: no further payment will be taken.',
        'nomatch' => 'We could not match this reference and this address to a subscription. Check the reference, which is in the confirmation email, or write to contact@copius.fr: your request stays on record at the date above.',
        'wack_subject' => 'Copius: acknowledgement of your withdrawal',
        'wack_lead' => 'We received your withdrawal, sent on {at}:',
        'wack_lead_nomatch' => 'We received, on {at}, a withdrawal for reference {r}, sent with this address.',
        'wack_text' => 'I hereby give notice that I withdraw from the subscription contract for the full version of Copius, reference {r}.',
        'wack_done' => 'Your access to the full version is closed and no further payment will be taken.',
        'wack_late' => 'The withdrawal period for this subscription ended on {d}, so your request cannot count as a withdrawal. To end the subscription, use the “Cancel your contract” function ({u}). Any question: contact@copius.fr.',
        'notice_subject' => 'Copius: your yearly subscription renews on {d}',
        'notice_box' => 'Deadline to refuse the renewal: {d}',
        'notice_text' => 'Your yearly subscription to the full version of Copius (reference {r}) will renew for one year on {renew}, at {a} ({vat}). If you do not want it renewed, use the “Cancel your contract” function before the deadline above: {u}. Unless you refuse, your card will be charged on {renew}.',
        'bye' => 'Happy reading, and happy cooking.',
        'seller' => 'Copius · Gabriel Gracian-Leroudier, sole trader (Nokime) · 21 rue des Docteurs Charcot, 42100 Saint-Étienne, France · SIREN 130 694 615, RCS Saint-Étienne · contact@copius.fr',
        'months' => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ],
];

/* French spacing: a no-break space before a colon and a euro sign, a narrow one
   before ; ? ! and inside guillemets. Plain spaces only, so URLs are never touched. */
function nb(string $s, string $lang): string {
    if ($lang !== 'fr') return $s;
    return strtr($s, [' :' => "\u{00A0}:", ' ;' => "\u{202F};", ' ?' => "\u{202F}?", ' !' => "\u{202F}!",
        '« ' => "«\u{202F}", ' »' => "\u{202F}»", ' €' => "\u{00A0}€"]);
}

/* The CGV of a version as a PDF: the file /cgv/ links for download, built by
   tools/build-cgv.py, and the one the confirmation attaches. */
function cgv_pdf(string $version, string $lang): string {
    return dirname(__DIR__) . '/cgv/copius-cgv-' . basename($version) . '-' . $lang . '.pdf';
}

/* A label's colon: French takes a no-break space before it, English none. */
function colon(string $lang): string { return $lang === 'fr' ? "\u{00A0}: " : ': '; }

function fmt_date(string $d, string $lang): string {
    $t = strtotime($d);
    if ($t === false) throw new InvalidArgumentException('not a date');
    $m = PAY_TEXT[$lang]['months'][(int)date('n', $t) - 1];
    return ($lang === 'fr' && date('j', $t) === '1' ? '1er' : date('j', $t)) . " $m " . date('Y', $t);
}

function fmt_at(int $ts, string $lang): string {
    return fmt_date(date('Y-m-d', $ts), $lang) . ($lang === 'fr' ? ' à ' . date('G', $ts) . "\u{00A0}h\u{00A0}" . date('i', $ts) : ' at ' . date('H:i', $ts) . ' (Paris)');
}

function fmt_money(int $cents, string $lang): string {
    $n = number_format($cents / 100, $cents % 100 ? 2 : 0, $lang === 'fr' ? ',' : '.', '');
    return $lang === 'fr' ? "$n €" : "€$n";
}

/* The message for one outbox row, or null when it cannot be built (a header
   value with a line break, the CGV file missing). */
function pay_mail(array $row): ?array {
    $lang = $row['lang'] === 'en' ? 'en' : 'fr';
    $t = PAY_TEXT[$lang];
    $p = json_decode((string)$row['payload'], true) ?: [];
    $f = fn(string $k, array $v = []): string => nb(strtr($t[$k], $v), $lang);
    $money = fn(int $c): string => nb(fmt_money($c, $lang), $lang);
    $o = (string)cfg('origin');
    $b = [];       // blocks: [p, text] [box, lines] [btn, label, url] [small, text]
    $files = [];
    $bye = false;
    switch ($row['kind']) {
    case 'confirm':
        $subject = $t['confirm_subject'];
        $r = (string)$row['ref'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('confirm_lead')];
        $b[] = ['btn', $t['signin'], signin_link((string)$row['to_addr'], $lang)];
        $b[] = ['small', $f('signin_note')];
        $b[] = ['p', $f('confirm_box')];
        $b[] = ['box', [
            $f('ref') . colon($lang) . $r,
            $f('plan_' . $p['plan']),
            $f('price_paid') . colon($lang) . $money((int)$p['cents']) . ' (' . $t['vat'] . ')',
            $f('start') . colon($lang) . fmt_date($p['started'], $lang),
            $f('next') . colon($lang) . fmt_date($p['next'], $lang) . ', ' . $money(PLANS[$p['plan']]['cents']),
            $f('accepted', ['{at}' => fmt_at((int)$p['cgv_at'], $lang), '{v}' => fmt_date((string)$p['cgv'], $lang)]),
        ]];
        $b[] = ['p', $t['bye']];
        /* What the law asks the confirmation to carry (L221-13), whole but quiet:
           after a rule, in the small type, every word kept. */
        $b[] = ['rule'];
        if ($p['plan'] === 'yearly') $b[] = ['small', $f('year_one')];
        $b[] = ['small', $f('withdraw', ['{d}' => fmt_date(withdraw_deadline($p['started']), $lang), '{u}' => "$o/renoncer/#r=$r"])];
        $b[] = ['small', $f('cancel_any', ['{u}' => "$o/resilier/#r=$r"])];
        $b[] = ['small', $f('keep')];
        $b[] = ['small', $f('claims')];
        $v = basename((string)$p['cgv']);
        foreach (['fr', 'en'] as $cl) {
            $pdf = @file_get_contents(cgv_pdf($v, $cl));
            if (is_string($pdf) && strncmp($pdf, '%PDF', 4) === 0) $files[] = ["copius-cgv-$v-$cl.pdf", 'application/pdf', $pdf];
            elseif ($cl === 'fr') return null;            // never a confirmation without its CGV
            if ($lang === 'fr') break;
        }
        break;
    case 'already':
        $subject = $t['already_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('already_lead', ['{r}' => $p['ref']])];
        $b[] = ['p', $f('already_signin')];
        break;
    case 'failed':
        $subject = $t['failed_subject'];
        $b[] = ['p', $t['hello']];
        $b[] = ['p', $f('failed_lead', ['{a}' => $money((int)$p['cents']), '{r}' => $p['ref']])];
        $b[] = ['p', $f('failed_keep', ['{d}' => fmt_date($p['until'], $lang)])];
        if (preg_match('#^https://[\x21-\x7e]+$#', (string)($p['pay'] ?? ''))) $b[] = ['btn', $t['failed_pay'], $p['pay']];
        break;
    case 'cancel_ack':
        $subject = $t['cack_subject'];
        $b[] = ['p', $t['hello']];
        $wish = $p['choice'] === 'early' && $p['date'] ? $f('wish_early', ['{d}' => fmt_date($p['date'], $lang)]) : $t['wish_period_end'];
        if (!$p['matched']) {
            $b[] = ['p', $f('cack_lead_nomatch', ['{at}' => fmt_at((int)$p['at'], $lang), '{r}' => $p['ref']])];
            $b[] = ['p', $f('nomatch')];
            break;
        }
        $b[] = ['p', $f('cack_lead', ['{at}' => fmt_at((int)$p['at'], $lang)])];
        $lines = [$t['name'] . colon($lang) . $p['name'], $t['email'] . colon($lang) . $row['to_addr'],
                  $t['ref'] . colon($lang) . $p['ref'], $t['wish'] . colon($lang) . $wish];
        if ($p['motif'] !== '') $lines[] = $t['motif'] . colon($lang) . $p['motif'];
        $b[] = ['box', $lines];
        $end = $p['end'] ? fmt_date((string)$p['end'], $lang) : '';
        if ($p['outcome'] === 'ended_already') { $b[] = ['p', $f('ended')]; break; }
        if ($p['outcome'] === 'already') { $b[] = ['p', $end !== '' ? $f('cack_already', ['{d}' => $end]) : $f('cack_already_open')];
            if ($p['motif'] !== '') $b[] = ['p', $f('cack_motif')];
            break; }
        if ($p['applied'] === 'now') { $b[] = ['p', $f('cack_now', ['{d}' => $end])]; break; }
        $b[] = ['p', $f('cack_end', ['{d}' => $end])];
        if ($p['applied'] === 'year_end') {
            if ($p['choice'] === 'early') $b[] = ['p', $f('cack_year')];
            if ($p['motif'] !== '') $b[] = ['p', $f('cack_motif')];
        } elseif ($p['choice'] === 'early' && $p['applied'] !== 'early') {
            $b[] = ['p', $f('cack_late')];
        }
        if ((int)$p['refund'] > 0) $b[] = ['p', $f('refund', ['{a}' => $money((int)$p['refund']), '{d}' => fmt_date(add_days((string)$p['end'], 14), $lang)])];
        break;
    case 'withdraw_ack':
        $subject = $t['wack_subject'];
        $b[] = ['p', $t['hello']];
        if (!$p['matched']) {
            $b[] = ['p', $f('wack_lead_nomatch', ['{at}' => fmt_at((int)$p['at'], $lang), '{r}' => $p['ref']])];
            $b[] = ['p', $f('nomatch')];
            break;
        }
        $b[] = ['p', $f('wack_lead', ['{at}' => fmt_at((int)$p['at'], $lang)])];
        $b[] = ['box', [$f('wack_text', ['{r}' => $p['ref']]), $t['name'] . colon($lang) . $p['name'],
                        $t['email'] . colon($lang) . $row['to_addr']]];
        if ($p['outcome'] === 'out_of_time') {
            $b[] = ['p', $f('wack_late', ['{d}' => fmt_date((string)$p['deadline'], $lang), '{u}' => "$o/resilier/#r={$p['ref']}"])];
            break;
        }
        $b[] = ['p', $f('wack_done')];
        if ((int)$p['refund'] > 0) $b[] = ['p', $f('refund', ['{a}' => $money((int)$p['refund']),
            '{d}' => fmt_date(add_days(date('Y-m-d', (int)$p['at']), 14), $lang)])];
        break;
    case 'notice':
        $subject = $f('notice_subject', ['{d}' => fmt_date($p['renews'], $lang)]);
        $b[] = ['p', $t['hello']];
        $b[] = ['box', [$f('notice_box', ['{d}' => fmt_date($p['deadline'], $lang)])]];
        $b[] = ['p', $f('notice_text', ['{r}' => $p['ref'], '{renew}' => fmt_date($p['renews'], $lang),
            '{a}' => $money((int)$p['cents']), '{vat}' => $t['vat'], '{u}' => "$o/resilier/#r={$p['ref']}"])];
        $bye = true;
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
    if ($bye) $b[] = ['p', $t['bye']];
    $subject = nb($subject, $lang);
    return mail_build((string)$row['to_addr'], $subject, blocks_text($b, $t['seller'], $lang),
        fn(bool $banner): string => blocks_html($b, $lang, $subject, $t['seller'], $banner), $files);
}

function blocks_text(array $blocks, string $seller, string $lang): string {
    $out = [];
    $rule = str_repeat('━', 40);
    foreach ($blocks as $bl) {
        $out[] = match ($bl[0]) {
            'p', 'small' => preg_replace('/\[\[([^|\]]+)\|([^\]]+)\]\]/u', '$1 ($2)', $bl[1]),
            'rule' => '—',
            'box' => $rule . "\n" . implode("\n", $bl[1]) . "\n" . $rule,
            'btn' => $bl[1] . colon($lang) . $bl[2],
        };
    }
    return implode("\n\n", $out) . "\n\n" . $seller . "\n";
}

/* The sign-in mail's frame (mail_html): the same card, colours and Outlook
   fixes, holding paragraphs, a framed box and a button. */
function blocks_html(array $blocks, string $lang, string $subject, string $seller, bool $banner): string {
    $e = fn(string $s): string => nl2br(htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8'), false);
    /* Copius's own words only: an address in them becomes a link (never in a
       box, which quotes what the reader typed). */
    $linked = fn(string $s): string => preg_replace('#(?<!href=")https?://[A-Za-z0-9./:_=\#-]+[A-Za-z0-9/=]#', '<a href="$0" style="color:#4F5B3F">$0</a>',
        preg_replace('/\[\[([^|\]]+)\|([^\]]+)\]\]/u', '<a href="$2" style="color:#6A6E5F">$1</a>', $e($s)));
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
            'rule' => '<hr style="margin:26px 0 18px;border:0;border-top:1px solid #E5E7DA">',
            'small' => '<p style="margin:0 0 16px;' . $sans . ';font-size:13px;line-height:1.5;color:#6A6E5F">' . $linked($bl[1]) . '</p>',
            'box' => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">' .
                '<tr><td style="padding:14px 18px;border:1px solid #CBD0BB;border-radius:6px;background:#F7F6F1;' . $sans .
                ';font-size:14px;line-height:1.6;color:#1E211A">' . implode('<br>', array_map($e, $bl[1])) . '</td></tr></table>',
            'btn' => '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 14px"><tr>' .
                '<td bgcolor="#4F5B3F" style="border-radius:6px;background:#4F5B3F;mso-padding-alt:13px 28px">' .
                '<a href="' . htmlspecialchars($bl[2], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '" style="display:inline-block;padding:13px 28px;' .
                $sans . ';font-size:15px;font-weight:600;color:#FFFEFC;text-decoration:none;border-radius:6px">' . $e($bl[1]) . '</a></td></tr></table>',
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
