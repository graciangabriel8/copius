# Copius — where it's going

Working note, started 2026-08-31. Not a plan to execute in order — a place to keep
the thinking so it isn't re-derived every session.

---

## Where it stands today

**Live:** https://graciangabriel8.github.io/copius/ — public, free, no premium tier yet.

- 510 ingredients across 15 families, bilingual EN/FR
- Each entry: name, latin, origin, seasonality, flavour notes, a story, a kitchen note, 8 pairings, an illustration
- 3,456 recorded pairings, a pairing lab, 40 classic trios
- Installable and works fully offline (PWA)
- Static site, no backend, no dependencies, no build step

**Audience: zero.** The site went public today. Nobody has found it yet, and that —
not features — is the binding constraint on everything below.

---

## The core split

The free tier is good enough that nobody *needs* to pay. Selling "more of the same"
was never going to work. So premium is a different **kind** of thing, not a bigger
quantity of the same thing:

> **Free is a dictionary — what is this?**
> **Premium is a school — how do I work it, why does it behave that way, what do I make?**

Nobody subscribes to a dictionary. People do pay to be taught. This is also what
justifies a recurring price rather than a one-off.

**Nothing gets removed from the free tier to make premium.** An earlier plan locked
the rare ✦ and prestige ◆ entries behind the paywall; that was abandoned, and rightly —
those are the most shareable entries in the atlas and locking them would have paywalled
the marketing. Premium is additive.

---

## Premium: four pillars, one object

These were thought of separately, but they're four views of the same thing.

### 1. The work tree
An ingredient at the core, its preparations as branches.

```
potato
 ├── purée      ratio, ricer vs food mill, why waxy fails
 ├── roasted    fat choice, par-boil, surface area
 ├── confit
 └── gnocchi
```

Each branch carries technique, guidelines, tips, and the dishes built on it.
**This is the structure that makes the other three pillars addressable** — you can't
say "onion works with apple *when caramelised*" until caramelised onion is a thing the
site knows about.

Only for the workhorses — potato, egg, onion, butter, chicken. Nobody needs a tree for yuzu.

### 2. Pairing mechanics
The free atlas says *X goes with Y*. That's barely information, and it misleads,
because the pairing depends entirely on preparation:

- **Onion + apple** — works with slow-caramelised onion and a sharp apple. Raw onion
  with sweet cooked apple is two sugars and a harsh allium bite.
- **Tomato + basil** — classic raw. Cook the basil twenty minutes and it turns bitter.
- **Strawberry + balsamic** — needs aged, syrupy vinegar. Young sharp balsamic just sours the fruit.
- **Beef + blue cheese** — works on a hard-seared steak because the crust stands up to it.

So the unit isn't *(A, B)*. It's **(A prepared this way, B prepared this way, because of
this mechanism, and here's when it stops working)**.

No existing product does this. The Flavor Bible and Foodpairing both give affinity
without mechanism.

### 3. Iconic dishes, chefs, establishments
The **narrative** form of pillars 1 and 2. Sole meunière is a worked example: brown the
butter properly, lemon off the heat, parsley at the last second. A dish is a branch with
a name; a chef is a body of such decisions.

Links down into the free atlas, so premium pulls readers through the free tier.

### 4. Structured learning path
The four above, sequenced so a beginner can follow them rather than browse them.
This is what makes it a *formation* instead of a reference — and it's the pillar that
most justifies a monthly price, since a path has a next step and a dictionary doesn't.

---

## Build order

Deliberately small. The temptation is to plan five years and ship nothing.

1. **One work tree, complete.** Potato — every branch, real guidance, honest tips.
   It tells you how long a tree takes, whether you can write it well, and whether it
   reads like something worth paying for. A week that answers those questions is cheap.
2. **Three pairing mechanics** for pairings you've actually cooked.
3. **Three stories** — one dish, one chef, one establishment.
4. Only then decide the shape, price and gate. The data model should fall out of what
   those nine pieces actually needed, not be designed in advance.

---

## Decisions already locked

- **Nothing is removed from free.** Premium is additive, always.
- **Annotated pairings live in a separate dataset**, keyed by the pair. `pairs` stays a
  flat array of ids so the free atlas is untouched.
- **Soft gate is acceptable.** A static site can't truly hide premium content from anyone
  who opens devtools. At this scale that person was never going to pay anyway; the
  searchable, interlinked product is worth more than theoretical leak-proofing.
- **Payments:** Stripe Payment Links, no backend. Annual billing halves the fee drag on
  small tickets. Fulfil access by hand until roughly 50 subscribers — building auth for
  ten people is the classic mistake.
- **iOS:** free app, purchases stay on the web. Apple takes nothing on a transaction that
  never touches the app. Build it when there's something worth downloading and a *paying*
  user has asked.

---

## Open risks and debts

- **The storylines are unverified.** 338 of the 510 entries were written from knowledge,
  not from sources checked one by one. Fine for a free atlas; **not fine before charging.**
  An accuracy pass with sources attached is a prerequisite for premium, and it's a
  different job from writing them.
- **Technique writing is where being a beginner actually costs.** A wrong etymology is
  embarrassing; a wrong purée ratio is noticed by everyone who tries it. This is the one
  part that can't be researched around — it has to have been cooked.
- **Technique instruction competes with free.** Serious Eats, Kenji, ChefSteps, YouTube —
  excellent, established, free. The advantage isn't better technique writing. It's that
  **nobody connects ingredient → preparations → shifting pairings in one place.** The
  integration is the product; individual guides aren't.
- **Nobody knows Copius exists.** Still the binding constraint. Sharing the link and
  watching what people search for is worth more than any feature on this page.

---

## Parked, with the reason

- **Multilingual (5+ languages).** Wanted eventually. **Do the data split first:** the site
  currently loads 724 KB on every visit, 64% of it EN/FR prose. At seven languages that's
  ~1.6 MB downloaded by everyone to read one seventh. Migrating two languages is an
  afternoon; migrating seven is a miserable week. A likely middle path: translate the
  structural fields widely, keep the stories in EN and FR.
- **`copius.fr`.** ~€10–15/year. Points at this same repo, no migration, nothing breaks.
  Needed before charging — a Stripe checkout on a github.io subpath reads as untrustworthy.
- **App Store.** $99/year, perpetual. The PWA already delivers the offline atlas and the
  home-screen icon. The store adds discovery, install legitimacy and one-tap install —
  all of which matter only once people are already looking for you.
- **Brand recommendations per product.** Real pain, real value, but: brands are
  country-specific so the dataset fragments per market, credible recommendations need
  testing at scale, and naming brands makes affiliate money available, which puts the
  credibility — the whole moat — at risk. The safe version is *what to look for on the
  label* rather than *buy this brand*.
- **Weekly recipes as a premium item.** Dropped as a standalone: free recipe supply is
  infinite, NYT Cooking owns paid recipes, and worst of all it's a treadmill — miss a week
  and people churn. Weekly content only works if it's the byproduct of work being done
  anyway, which the work trees and pairing mechanics are.
