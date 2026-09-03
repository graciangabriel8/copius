# Copius — where it's going

Working note. Keeps the decisions *and their reasons* so they aren't re-argued.

## Now (2026-09-03)

Live at https://graciangabriel8.github.io/copius/ — free, bilingual EN/FR, offline PWA.

- **1,857 ingredients** in 21 families, 420 lesser-known ✦, 107 premium ◆, each with a price
  band and an indicative French retail range; 12,933 pairings.
- **11 work trees, 66 preparations** — potato, egg, onion, butter, tomato, chicken, garlic,
  cream, mushroom, apple, dark chocolate.
- **81 chefs**, Taillevent to today, 22 women, 17 countries, 55 with stars; filters by
  gender, stars, country, era; 67 link to the restaurant's own site.

- **135 techniques** — cuissons, préparations, liaisons, cold work, pastry; each with method
  numbers and a "what goes wrong".
- **59 dishes** — classics taken apart: ingredients, techniques, why the balance works, and what to
  drink. 178 wine notes, appellation-and-mechanism only.

**Audience: two people.** That's the binding constraint, not features.

## The split

**Free is a dictionary — what is this. Premium is a school — how to work it, why it
behaves that way, what to make.** Nobody subscribes to a dictionary; people pay to be
taught. Nothing is ever removed from free — premium is additive.

## Premium: four views of one object

- **Work trees** — ingredient → its preparations, each with technique and tips. *Built.*
- **Techniques** — the gestures, with their failure modes. *Built, 135.*
- **Pairing mechanics** — not *X goes with Y* but why, at which preparation, and when it
  fails. Caramelised onion works with sharp apple; raw onion with sweet apple doesn't.
  *Not started.*
- **Dishes, chefs, houses** — the narrative form of the above. *Chefs built (81). Dishes built (59).
  Houses open. Descriptive only; stars as plain characters, never the macaron, which is Michelin's
  registered mark.*
- **A sequenced path** — what makes it a formation rather than a reference. *Not started.*

## Wine, and what the law allows

Loi Évin (CSP art. L3323-4) limits alcohol content to a closed list: degree, origin,
appellation, terroir, composition, how it is made, how it is sold, how it is consumed,
awards, and objective colour, aroma and taste. Pairing advice sits inside that list as
"mode de consommation". What is forbidden is the register, not the subject — no pleasure,
occasion or conviviality framing.

There is **no editorial or educational exemption**: Cass. crim. 3 Nov 2004 tests by effect,
"quelle qu'en soit la finalité". So dishes name appellations and grapes, never producers or
vintages, and every wine note gives the mechanism — acidity cuts fat, tannin clashes with
iodine. The health message is carried on any page naming a drink. Fine is €75,000.

## Next, in order

1. **Ten strangers using it.** Post it, ask what they searched for and didn't find, add a
   cookie-less counter. Everything below waits on this.
2. **Three pairing mechanics** for things actually cooked. Tests whether premium holds
   before any checkout exists.
3. Houses, once the dishes and chefs pages show people read that far.
4. Weekly dish on top of the 59, if it stays enjoyable. Not an obligation — the library stands alone.

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
