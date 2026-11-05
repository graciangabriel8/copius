#!/bin/bash
# The free trial's probes, run in the payment rig after its reset-a.sh has copied this
# branch: the binding button, the offer, one trial per address, the card check, the
# reminder and its alerts, the failed first charge, cancelling during a trial, and no
# renewal notice before a first charge. Each has its control in controls-trial.sh.
#   RIG=~/Projets/copius-rig bash tools/probes-trial.sh
set -u
RIG=${RIG:-$HOME/Projets/copius-rig}
eval "$(sed -n '2,/^A=buyer@example.com/p' "$RIG/probes-pay.sh")"   # its helpers, one home
conf "'payments_live' => false" "'payments_live' => true"
conf "'payment_tables' => true" "'payment_tables' => true, 'trial_days' => 7"
order() { curl -s -X POST -H "$O" -H "$J" -d "$1" $B/api/order.php; }
# A trial as Stripe reports it: trialing, a first invoice of 0 for the trial's days.
trial() {  # address plan: prints the order id
  local o; o=$(mkorder "$1" "$2"); mksub "sub_$o" "$o" trialing $((NOW + 7 * D)) $NOW "in_$o" paid 0
  hook invoice.paid "$(inv "in_$o" "sub_$o" "$o" subscription_create $NOW $((NOW + 7 * D)) 0)" >/dev/null; sleep 1; echo "$o"
}

# --- the button that binds (code de la consommation L. 221-14)
page=$(curl -s $B/commande/); terms=$(curl -s $B/cgv/)
ok "the order button names the duty to pay" "$(printf '%s' "$page" | grep -c 'id="pay"><span lang="fr">Commander avec obligation de paiement</span>')" 1
ok "the terms name the same button" "$(printf '%s' "$terms" | grep -c 'Commander avec obligation de paiement')" 2
ok "the English page's button, named by both terms" "$(printf '%s' "$page" | grep -c '<span lang="en">Order with obligation to pay</span>') $(printf '%s' "$terms" | grep -c 'Order with obligation to pay')" "1 2"

# --- the offer
ok "a page showing another trial: 409, the real offer" "$(order "$(js email=o@example.com plan=monthly cgv:=true country=FR trial:=3)")" '{"error":"offer","trial":7}'
order "$(js email=o@example.com plan=monthly cgv:=true country=FR trial:=7)" >/dev/null
C=$(call "POST /v1/checkout/sessions")
ok "a trial order: the days, the card and the way back asked of Stripe" "$(field "$C" 'subscription_data[trial_period_days]') $(field "$C" payment_method_collection) $(field "$C" cancel_url | sed 's|.*/commande/||')" "7 always #retour"
sql "DELETE FROM rate_events"
order "$(js email=o2@example.com plan=monthly cgv:=true country=FR trial:=0)" >/dev/null
C=$(call "POST /v1/checkout/sessions")
ok "an order without a trial asks for none, and comes back without one" "$(field "$C" 'subscription_data[trial_period_days]') $(field "$C" cancel_url | sed 's|.*/commande/||')" " #retour-sans-essai"

# --- one trial per address
U=used@example.com; OU=$(mkorder $U monthly); sql "INSERT INTO subscriptions (id, order_id, email, plan, status) VALUES ('sub_used', '$OU', '$U', 'monthly', 'canceled')"
n=$(count "POST /v1/checkout/sessions"); sql "DELETE FROM rate_events"
ok "a second trial: the page learns nothing" "$(order "$(js email=$U plan=monthly cgv:=true country=FR trial:=7)")" '{"mailed":true}'
order "$(js email=$U plan=monthly cgv:=true country=FR trial:=7)" >/dev/null; sleep 1
ok "a second trial: no session, one mail a day" "$(( $(count "POST /v1/checkout/sessions") - n )) $(sql "SELECT COUNT(*) FROM outbox WHERE kind = 'trial_used' AND to_addr = '$U'")" "0 1"

# --- signup: nothing charged, no card to read, access open
TA=trial@example.com; OA=$(trial $TA monthly)
ok "a trial's zero invoice: no card-country alert" "$(alerts "cc:in_$OA")" 0
ok "a trial: access from the confirmation, until the trial's end" "$(kinds "$OA")$(access $TA) $(paid $TA)" "confirm:1 yes $(day 8)"

# --- the reminder
hourly
ok "no reminder a week out" "$(kinds "$OA")" "confirm:1 "
sql "UPDATE subscriptions SET paid_until = '$(day 2)' WHERE id = 'sub_$OA'"; hourly; hourly
ok "two days before: one reminder, on time" "$(kinds "$OA")$(alerts "trial_late:sub_$OA")" "confirm:1 trial_end:1 0"
ok "the reminder: the amount, the way to cancel" "$(mail_of 'essai gratuit se termine' | python3 -c "
import sys;s=sys.stdin.read();o=sys.argv[1];print('/resilier/#r='+o in s,'5,90' in s)" "$OA")" "True True"
TC=cancelled@example.com; OC=$(trial $TC monthly); sql "UPDATE subscriptions SET paid_until = '$(day 2)', cancel_at = $((NOW + 2 * D)) WHERE id = 'sub_$OC'"; hourly
ok "a cancelled trial: no reminder" "$(kinds "$OC")" "confirm:1 "
TL=late@example.com; OL=$(trial $TL monthly); sql "UPDATE subscriptions SET paid_until = '$(day 1)' WHERE id = 'sub_$OL'"; hourly
ok "under two days left: sent, Gabriel told" "$(kinds "$OL")$(alerts "trial_late:sub_$OL")" "confirm:1 trial_end:1 1"
TM=missed@example.com; OM=$(trial $TM monthly); sql "UPDATE subscriptions SET status = 'active' WHERE id = 'sub_$OM'"
TP=paid@example.com; OP=$(mkorder $TP monthly); mksub "sub_$OP" "$OP" active $((NOW + 30 * D)) $NOW "in_$OP" paid 590
hook invoice.paid "$(inv "in_$OP" "sub_$OP" "$OP" subscription_create $NOW $((NOW + 30 * D)) 590)" >/dev/null; sleep 1; hourly
ok "converted with no reminder: Gabriel told; a paid start is not a trial" "$(alerts "trial_missed:sub_$OM") $(alerts "trial_missed:sub_$OP")" "1 0"

# --- the first charge fails: no access, no retry window (CGV 4.4)
TF=failed@example.com; OF=$(trial $TF monthly)
sql "UPDATE subscriptions SET paid_until = '$(day 0)' WHERE id = 'sub_$OF'"; mksub "sub_$OF" "$OF" past_due $((NOW + 30 * D)) $NOW "in2_$OF" open 0
hook invoice.payment_failed "$(inv "in2_$OF" "sub_$OF" "$OF" subscription_cycle $NOW $((NOW + 30 * D)) 590)" >/dev/null; sleep 1
ok "a failed first charge: access closed, one mail" "$(access $TF) $(paid $TF) $(sql "SELECT COUNT(*) FROM outbox WHERE kind = 'failed' AND ref = '$OF'")" "no none 1"

# --- cancelling a yearly trial binds no year
sql "DELETE FROM rate_events"
TY=yearly@example.com; OY=$(trial $TY yearly)
post cancel.php "$(js name=Y email=$TY ref=$OY choice=period_end)" >/dev/null; sleep 1
ok "a yearly trial cancelled: ends with the trial" "$(sql "SELECT applied || ' ' || effective_date FROM cancellations WHERE ref = '$OY'")" "period_end $(day 7)"

# --- a yearly plan's first year runs from the trial's end: still bound in the year's last week
sql "DELETE FROM rate_events"
TW=lastweek@example.com; OW=$(trial $TW yearly); sql "UPDATE subscriptions SET started = '$(day -368)' WHERE id = 'sub_$OW'"
mksub "sub_$OW" "$OW" active $((NOW + 4 * D)) $((NOW - 361 * D)) "in2_$OW" paid 4900
post cancel.php "$(js name=W email=$TW ref=$OW choice=early "date=$(day 2)")" >/dev/null; sleep 1
ok "a converted yearly trial, 12 months after its start: still its first year" "$(sql "SELECT applied || ' ' || effective_date FROM cancellations WHERE ref = '$OW'")" "year_end $(day 4)"

# --- no renewal notice for a trial that has just converted
TN=convert@example.com; ON=$(trial $TN yearly); sql "UPDATE subscriptions SET status = 'active', paid_until = '$(day 20)' WHERE id = 'sub_$ON'"; hourly
ok "converted, first charge not recorded: no renewal notice, no alert" "$(sql "SELECT notice_missed FROM subscriptions WHERE id = 'sub_$ON'") $(alerts "missed:sub_$ON")" "0 0"

ok "no PHP error logged" "$(cat "$P"/logs/php-*.log 2>/dev/null | grep -v -c -E ' stripe (GET|POST|DELETE) |stuck_mail')" 0
echo "$fails failed"
