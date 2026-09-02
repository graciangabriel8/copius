# Copius — where it's going

Working note. Keeps the decisions *and their reasons* so they aren't re-argued.

## Now (2026-09-02)

Live at https://graciangabriel8.github.io/copius/ — free, bilingual EN/FR, offline PWA.

- **602 ingredients** in 15 families, 48 rare, 15 premium; search finds Oeuf and Œuf alike.
- **11 work trees, 66 preparations** — potato, egg, onion, butter, tomato, chicken, garlic,
  cream, mushroom, apple, dark chocolate.
- **81 chefs**, Taillevent to today, 22 women, 17 countries, 55 with stars; filters by
  gender, stars, country, era; 67 link to the restaurant's own site.

**Audience: two people.** That's the binding constraint, not features.

## The split

**Free is a dictionary — what is this. Premium is a school — how to work it, why it
behaves that way, what to make.** Nobody subscribes to a dictionary; people pay to be
taught. Nothing is ever removed from free — premium is additive.

## Premium: four views of one object

- **Work trees** — ingredient → its preparations, each with technique and tips. *Built.*
- **Pairing mechanics** — not *X goes with Y* but why, at which preparation, and when it
  fails. Caramelised onion works with sharp apple; raw onion with sweet apple doesn't.
  *Not started.*
- **Dishes, chefs, houses** — the narrative form of the above. *Chefs built. Descriptive
  only; stars as plain characters, never the macaron, which is Michelin's registered mark.
  Dishes and houses open.*
- **A sequenced path** — what makes it a formation rather than a reference. *Not started.*

## Next, in order

1. **Ten strangers using it.** Post it, ask what they searched for and didn't find, add a
   cookie-less counter. Everything below waits on this.
2. **Three pairing mechanics** for things actually cooked. Tests whether premium holds
   before any checkout exists.
3. Dishes and houses, once the chefs page shows people read that far.

Then decide shape, price and gate. The data model falls out of what those needed.

## Locked

- **French and English only.** The two kitchen languages; no third.
- Nothing removed from free.
- Annotated pairings = separate dataset; `pairs` stays a flat id array.
- Soft gate is fine — anyone opening devtools to dodge €10 was never paying.
- Stripe Payment Links, annual billing, access by hand to ~50 subscribers.
- iOS: free app, purchases on the web. Apple takes nothing it never touches.
- Chef entries stay neutral: facts, dates, quoted phrases with attribution. No verdicts.

## Risks

- **The storylines carry no sources.** Fine for free. Not fine before charging.
- **Technique writing needs cooking, not research** — a wrong purée ratio gets noticed.
- **Technique competes with free** (Serious Eats, Kenji, YouTube). The moat is the
  integration — ingredient → preparation → shifting pairings — not the guides themselves.
- **Living chefs** — descriptive facts are fine; anything reading as endorsement or
  criticism is not.

## Parked

- **copius.fr** — €10–15/yr. Needed before charging; a checkout on github.io reads badly.
- **App Store** — $99/yr, perpetual. The PWA already gives offline + home-screen icon.
- **Michelin authorisation** for the macaron — request sent by email (2026-09-02). Awaiting
  reply; stars stay plain ★ until a written yes.
- **Brand recommendations** — fragments per country, and affiliate money puts the
  credibility at risk. Safe version: *what to look for on the label*.
- **Weekly recipes** — a treadmill. Only works as a byproduct of the trees and mechanics.
