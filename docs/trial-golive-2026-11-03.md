# Free trial + paywall preview: go-live steps (prepared 3 Nov 2026, nothing fired)

Branch `paywall-trial`. Nothing here has been run against live Stripe or OVH.

## 0. Blocker: the label on Stripe's binding button

The CGV (5.1) and the law (L. 221-14 al. 2) need the button that binds the buyer to name the duty to pay. With `trial_period_days`, Stripe Checkout may label its button « Démarrer l'essai » instead of « Payer et s'abonner »; that label would not say a payment follows. Unverified.

Check in **test mode** (no live change, no cost): create a subscription Checkout Session with `trial_period_days: 7`, `locale: fr`, `payment_method_collection: always`, open it, read the button.

- Label says paying and subscribing → go on to step 1.
- Label says trial only → stop. Options, his call:
  1. our own review button becomes the binding one (« Commander avec obligation de paiement »), Stripe's page only takes the card; CGV 5.1 and 5.2 change again;
  2. ship the paywall preview and the counter without the trial (`trial_days` 0, CGV of 31 Oct stays).

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

- Trial only: `trial_days` => 0. The page then gets a 409 « l'offre a changé », shows the no-trial price and charges on the day; the static « 7 jours gratuits » copy stays, so a full rollback is the revert below.
- Everything: revert the branch's commits on main, push, `cgv_version` back to '2026-10-31'.
