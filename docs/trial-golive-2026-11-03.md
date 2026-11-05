# Free trial + paywall preview: go-live steps (prepared 3 Nov 2026, nothing fired)

Branch `paywall-trial`. Nothing here has been run against live Stripe or OVH.

## 0. The button that binds (settled)

The CGV (5.1) and the law (L. 221-14 al. 2) need the button that binds the buyer to name the duty to pay. With `trial_period_days`, Stripe Checkout labels its button « Démarrer la période d'essai », which does not say a payment follows, so our own review button is the binding one: « Commander avec obligation de paiement ». It places the order; Stripe's page only carries it out by taking the card, and its button adds no commitment. Leaving that page without giving a card cancels the order at no cost. Stripe's own button stays on screen, so the drafting reduces the risk that a buyer calls it the validating function and does not remove it: this reading of the law has had no lawyer's check, and he chose on 5 Nov 2026 to go without one for now, having read the terms.

Read in Stripe's test mode on 5 Nov 2026 (`trial_period_days` 7, `locale` fr, `payment_method_collection` always); his choice the same day. CGV 5.1 and 5.2 of 5 Nov carry it; their sources are `docs/cgv-copius-2026-11-05-{fr,en}.md`.

## 0b. Departures from the payment spec (signed off)

DESIGN-PAYMENT.md outranks the code and says nothing of a trial. He signed off these departures as spec owner on 5 Nov 2026 (the spec is not edited to match):

- Binding button (the spec's opening lines and its order-page section): ours, not Stripe's, as in step 0.

- §2 access: a first charge failing at a trial's end keeps no access and no 7-day retry window (`sub_until`, `amount` 0).
- §5 hourly job: a new step, `trial_reminders`, with alerts `trial_late` and `trial_missed`.
- §6 mails: new `trial_end`, `trial_used`, and the trial variants of the confirmation, failed and cancel mails; `trial_end` closes with « Bonne lecture ».
- §1 order input: `trial` (days shown, 0 for none); answers 409 `offer` and `mailed` for an address that already subscribed.
- §9 /merci/: « Votre commande est validée. »

Found by the review and signed off the same day:

- §1 order: `trialing` counts as a live subscription; the Checkout Session sets `payment_method_collection` to always.
- §4 card check: only on an invoice that charges (`cents` > 0).
- §7 first-year rule: not during a trial, and it covers the first paid period, so the year runs from the trial's end (CGV 8.2).
- §8 renewal notices: only when `amount` > 0.

## 0c. The trial's rig probes (done)

`tools/probes-trial.sh` covers the binding button, the retry window closed when `amount` is 0, the first-year rule skipped while trialing, the card-country check only when `cents` > 0, the 409 `offer` and the `trial_used` mail, `trial_reminders` and its two alerts, the `amount` > 0 filter in `renewal_notices`. `tools/controls-trial.sh` removes each guard: all 16 controls go red.

The real rig needs two edits before it runs them: `SRC` in `reset-a.sh` pointing at this branch, and in `probes-pay.sh` orders sending `country=FR` and the session probe expecting `payment_method_collection=always` and a `cancel_url` ending `/commande/#retour-sans-essai`. The 5 Nov run used a scratch copy with those edits.

## 1. config.php, just before the push

- `trial_days` => 7
- `cgv_version` => '2026-11-05'

Until the push lands, orders answer 503 (the new CGV PDF is not on the server yet). That is the intended order: no buyer is shown one offer and charged another.

## 2. Push

`sh tools/bump.sh`, `python3 tools/check.py`, commit, `git push origin HEAD:main`. The run deploys through OVH's API and goes red until copius.fr serves the new files; « Déployer Git » in the OVH panel is the manual fallback.

## 3. Stripe dashboard (his hands, live)

- Statement descriptor: 10 characters or fewer (Stripe appends « * TRIAL OVER » after a trial). Change only if the current one is longer.
- Settings → Billing → Subscriptions → trial-ending reminder: leave **off**. For trials of 7 days or less Stripe sends it at the trial's start; our own reminder goes 2 days before the end.

No other Stripe setting changes: the trial is set per Checkout Session by api/order.php.

## 4. Probes after deploy

- /cgv/ shows « Version du 5 novembre 2026 » and both new PDFs open.
- `GET /api/preview.php?id=basil` answers at most 3 ids; `GET /api/_preview.json` answers 404.
- `POST /api/hit.php?e=order_view` answers 204; `?e=nope` answers 400.
- The order page shows « 7 jours gratuits » and the trial row with the right date.

## Rollback

There is no trial-only rollback: `trial_days` 0 alone would leave « 7 jours gratuits » on the home page, the atlas and the order page for an offer nobody gets.

- Revert the branch's commits on main, push, `cgv_version` back to '2026-10-31'.
