# Free trial + paywall preview: go-live steps (prepared 3 Nov 2026, nothing fired)

Branch `paywall-trial`. Nothing here has been run against live Stripe or OVH.

## 0. Blocker: the label on Stripe's binding button

The CGV (5.1) and the law (L. 221-14 al. 2) need the button that binds the buyer to name the duty to pay. With `trial_period_days`, Stripe Checkout may label its button « Démarrer l'essai » instead of « Payer et s'abonner »; that label would not say a payment follows. Unverified.

Check in **test mode** (no live change, no cost): create a subscription Checkout Session with `trial_period_days: 7`, `locale: fr`, `payment_method_collection: always`, open it, read the button.

- Label says paying and subscribing → go on to step 1.
- Label says trial only → stop. Options, his call:
  1. our own review button becomes the binding one (« Commander avec obligation de paiement »), Stripe's page only takes the card; CGV 5.1 and 5.2 change again;
  2. ship the paywall preview and the counter without the trial (`trial_days` 0, CGV of 31 Oct stays).

## 0b. Blocker: the payment spec has no trial

DESIGN-PAYMENT.md outranks the code and says nothing of a trial. Where the branch departs from it, for his sign-off as spec owner (the spec is not edited to match):

- §2 access: a first charge failing at a trial's end keeps no access and no 7-day retry window (`sub_until`, `amount` 0).
- §5 hourly job: a new step, `trial_reminders`, with alerts `trial_late` and `trial_missed`.
- §6 mails: new `trial_end`, `trial_used`, and the trial variants of the confirmation, failed and cancel mails; `trial_end` closes with « Bonne lecture ».
- §1 order input: `trial` (days shown, 0 for none); answers 409 `offer` and `mailed` for an address that already subscribed.
- §9 /merci/: « Votre commande est validée. »

## 0c. Blocker: no rig probe covers the trial yet

`copius-rig/probes-pay.sh` has none for: the retry window closed when `amount` is 0, the first-year rule skipped while trialing, the card-country check only when `cents` > 0, the 409 `offer` and the `trial_used` mail, `trial_reminders` and its two alerts, the `amount` > 0 filter in `renewal_notices`. Each goes red with its guard removed before the push. PHP lints clean (rig's php -l, 3 Nov).

## 1. config.php, just before the push

- `trial_days` => 7
- `cgv_version` => '2026-11-03'

Until the push lands, orders answer 503 (the new CGV PDF is not on the server yet). That is the intended order: no buyer is shown one offer and charged another.

## 2. Push

`sh tools/bump.sh`, `python3 tools/check.py`, commit, `git push origin HEAD:main`. If OVH refuses the deploy notice (401), « Déployer Git » in the OVH panel.

## 3. Stripe dashboard (his hands, live)

- Statement descriptor: 10 characters or fewer (Stripe appends « * TRIAL OVER » after a trial). Change only if the current one is longer.
- Settings → Billing → Subscriptions → trial-ending reminder: leave **off**. For trials of 7 days or less Stripe sends it at the trial's start; our own reminder goes 2 days before the end.

No other Stripe setting changes: the trial is set per Checkout Session by api/order.php.

## 4. Probes after deploy

- /cgv/ shows « Version du 3 novembre 2026 » and both new PDFs open.
- `GET /api/preview.php?id=basil` answers at most 3 ids; `GET /api/_preview.json` answers 404.
- `POST /api/hit.php?e=order_view` answers 204; `?e=nope` answers 400.
- The order page shows « 7 jours gratuits » and the trial row with the right date.

## Rollback

There is no trial-only rollback: `trial_days` 0 alone would leave « 7 jours gratuits » on the home page, the atlas and the order page for an offer nobody gets.

- Revert the branch's commits on main, push, `cgv_version` back to '2026-10-31'.
