#!/bin/bash
# Controls for probes-trial.sh: each removes one guard from the rig's copy and names
# the probe that must then fail. A probe that stays green without its guard proves
# nothing.   RIG=~/Projets/copius-rig bash tools/controls-trial.sh
RIG=${RIG:-$HOME/Projets/copius-rig}; HERE=$(cd "$(dirname "$0")" && pwd); A=$RIG/site/copius
mutate() {  # file, old, new: replace exactly once in the rig copy
  python3 - "$A/$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:]; s = open(p).read()
assert s.count(a) == 1, "control does not apply: " + a[:60]; open(p, "w").write(s.replace(a, b))
PY
}
control() {  # name, probe that must fail, file, old, new
  sh $RIG/reset-a.sh prof@ac-lyon.fr >/dev/null 2>&1; sleep 1
  mutate "$3" "$4" "$5" || { echo "ERROR $1"; return; }
  if RIG=$RIG bash $HERE/probes-trial.sh 2>/dev/null | grep -q "^FAIL $2"; then echo "RED   $1"; else echo "GREEN $1  <- the probe did not notice"; fi
}
control "the old button" "the order button names" commande/index.html \
  '<span lang="fr">Commander avec obligation de paiement</span>' '<span lang="fr">Continuer vers le paiement</span>'
control "the English button changed" "the English page's button" commande/index.html \
  '<span lang="en">Order with obligation to pay</span>' '<span lang="en">Continue to payment</span>'
control "no trial forgotten on the way back" "an order without a trial" api/order.php \
  "'/commande/#retour' . (\$trial ? '' : '-sans-essai')," "'/commande/#retour',"
control "any trial a page shows" "a page showing another trial" api/order.php \
  'if ($trial !== 0 && $trial !== $offer) {' 'if (false) {'
control "a trial never asked of Stripe" "a trial order: the days" api/order.php \
  "+ (\$trial ? ['trial_period_days' => \$trial] : [])," ","
control "a second trial for an address" "a second trial: the page" api/order.php \
  "if (\$trial && q('SELECT 1 FROM subscriptions WHERE email = ? LIMIT 1', [\$addr])->fetch()) {" "if (false) {"
control "the card read on a zero invoice" "a trial's zero invoice" api/stripe.php \
  'if ($cents > 0) try {' 'try {'
control "the reminder never queued" "two days before: one reminder" api/_purge.php \
  "'trials' => fn() => trial_reminders()," "'trials' => fn() => null,"
control "a reminder after a cancellation" "a cancelled trial: no reminder" api/_pay.php \
  "WHERE s.status = 'trialing' AND s.cancel_at IS NULL AND" "WHERE s.status = 'trialing' AND"
control "a late reminder not alerted" "under two days left" api/_pay.php \
  "if (\$s['paid_until'] < add_days(\$day, 2) && !q(" "if (false && !q("
control "a missed reminder not alerted" "converted with no reminder" api/_pay.php \
  "AND EXISTS (SELECT 1 FROM payments p WHERE p.subscription = s.id AND p.amount = 0)" "AND 1 = 0"
control "a paid start alerted as a trial" "converted with no reminder" api/_pay.php \
  "WHERE p.subscription = s.id AND p.amount = 0)" "WHERE p.subscription = s.id)"
control "a failed first charge keeps access" "a failed first charge" api/_lib.php \
  "if (\$s['status'] === 'past_due' && (int)\$s['amount'] === 0) return null;" ""
control "a yearly trial binds its year" "a yearly trial cancelled" api/_pay.php \
  "if (\$v['status'] !== 'trialing' && \$sub['plan'] === 'yearly'" "if (\$sub['plan'] === 'yearly'"
control "a yearly year counted from the trial's start" "a converted yearly trial" api/_pay.php \
  "paris_date(\$v['start']) < add_months((string)\$sub['started'], 12)" "\$day < add_months((string)\$sub['started'], 12)"
control "a renewal notice before the first charge" "converted, first charge not recorded" api/_pay.php \
  "AND paid_until IS NOT NULL AND amount > 0" "AND paid_until IS NOT NULL"
sh $RIG/reset-a.sh prof@ac-lyon.fr >/dev/null 2>&1
