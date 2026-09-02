# Copius — where it's going

Working note. Keeps the decisions *and their reasons* so they aren't re-argued.

## Now

Live at https://graciangabriel8.github.io/copius/ — 510 ingredients, bilingual,
offline PWA, free, no premium tier.

**Audience: zero.** That's the binding constraint, not features.

## The split

**Free is a dictionary — what is this. Premium is a school — how to work it, why it
behaves that way, what to make.** Nobody subscribes to a dictionary; people pay to be
taught. Nothing is ever removed from free — premium is additive.

## Premium: four views of one object

- **Work trees** — ingredient → its preparations (potato → purée, roasted, confit, gnocchi),
  each with technique and tips. Makes the other three addressable.
- **Pairing mechanics** — not *X goes with Y* but why, at which preparation, and when it
  fails. Caramelised onion works with sharp apple; raw onion with sweet apple doesn't.
- **Dishes, chefs, houses** — the narrative form of the above. *Started: seven chefs,
  Taillevent to Bocuse, in their own tab. Descriptive only; Michelin stars as plain
  characters and facts, never the macaron, which is their registered mark.*
- **A sequenced path** — what makes it a formation rather than a reference.

Trees only for the workhorses: potato, egg, onion, butter, chicken.

## Build order

1. **One potato tree, complete.**
2. Three pairing mechanics for things you've actually cooked.
3. ~~Three stories~~ — chefs done (7). Dishes and houses still open.

Then decide shape, price and gate. The data model falls out of what those nine needed.

## Locked

- **French and English only.** The two kitchen languages; no third. This deletes the
  data-split migration that was parked below — the 724 KB payload stays as it is.
- Nothing removed from free.
- Annotated pairings = separate dataset; `pairs` stays a flat id array.
- Soft gate is fine — anyone opening devtools to dodge €10 was never paying.
- Stripe Payment Links, annual billing, access by hand to ~50 subscribers.
- iOS: free app, purchases on the web. Apple takes nothing it never touches.

## Risks

- **338 of 510 storylines are unsourced.** Fine for free. Not fine before charging.
- **Technique writing needs cooking, not research** — a wrong purée ratio gets noticed.
- **Technique competes with free** (Serious Eats, Kenji, YouTube). The moat is the
  integration — ingredient → preparation → shifting pairings — not the guides themselves.

## Parked

- **copius.fr** — €10–15/yr. Needed before charging; a checkout on github.io reads badly.
- **App Store** — $99/yr, perpetual. The PWA already gives offline + home-screen icon.
- **Brand recommendations** — fragments per country, and affiliate money puts the
  credibility at risk. Safe version: *what to look for on the label*.
- **Weekly recipes** — a treadmill. Only works as a byproduct of the trees and mechanics.
