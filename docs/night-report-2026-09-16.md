# Night report — 16/17 September 2026

Live at v162. Two workflows, fourteen agents, six commits.

## Texture is in, and the lab reads it

**All 1 838 entries and all 66 work-tree branches** carry 2–3 tags from a closed
vocabulary of 23 on five axes. The engine reads them **with the form taken into
account**, which is the whole reason the branches were worth doing: potato purée
with cream and mascarpone trips *"nothing here resists the teeth"*, and the same
plate with frites does not.

**It is deliberately not scored.** Measured over the trios and the chefs' dishes
against 4 000 random plates, texture separates real cooking from ingredients
drawn out of a hat by **minus three points** — random plates score *higher*,
because a scattered set of ingredients is texturally various by accident while a
real dish is focused. That is precisely what the flavour reading does, and the
same conclusion follows: it tells a cook about their own plate but cannot rank
plates. The grade stays 40% flavour, 60% recorded accords, and salmon · dill ·
lemon still reads 78.

The texture bonuses are share-based for the same reason the flavour ones are:
*"something resists and something yields"* was true of 96% of random plates
before tightening, and a line that always appears says nothing. It now fires on
38% of real plates.

## The audit, and why it is worth believing

Five deliberately wrong rows went into the audit set unmarked: crème fraîche
called crisp, a hazelnut called soft, one row with four tags, one with two
contradicting yield tags, one with invented tags. **All five were caught**,
which is the only reason the rest of the audit means anything. Seventeen real
rejections followed and all seventeen were applied. The sharpest:

- seven whole grains (emmer, freekeh, green spelt, khorasan, Job's tears,
  hominy, wild rice) tagged `chewy` — what they become after forty minutes in
  water, not how a cook meets them
- three sesame pastes tagged `moist` when their own tips make water the failure
  mode: *"It seizes on contact with water"*
- gold and silver leaf tagged `brittle`, the one thing foil at that thickness is
  not — it drapes and tears

**A second pass then fixed two things the audit named.** `fluid` became the 23rd
tag, closing a real gap: a vinegar is neither juicy nor dry nor moist, and
`moist` means a damp *solid*. And the cellar, which had 157 entries across only
16 tag-sets with 47 of them an identical `dry, powdery`, was re-tagged — 89 rows
changed, distinct sets doubled to 32. Clear eaux-de-vie, fino and dry vermouth
are `fluid`; aged brandies carrying glycerol are `silky`; a PX or a vin de paille
is `viscous`. The 86 entries the first pass had flagged as genuine doubts were
re-judged too, 13 changed.

## A hole I had made

**The `nuts` family was missing from the role map entirely.** All sixty —
almonds, walnuts, pistachios, sesame — were falling through to "on the side",
reachable by no guided template. Filed under seasoning, because that role
already holds what finishes a plate rather than composing it. **Overrule it if
the kitchen says otherwise.** `plate.js` now exposes a check that names any
family the map has forgotten, so the next one fails loudly instead of quietly.

## The five prose claims

Verified against sources opened, not search summaries.

**Nyons — verified.** Decree of 10 January 1994, and earlier than its nearest
rival, Les Baux-de-Provence (27 August 1997). "First French olive appellation"
holds.

**Génépi — limit verified, date stale.** The préfecture confirms 120 brins per
person per day across three species, but cites **AP_2025-1142**, a 2025 arrêté.
The entry names a June 2021 decree, which was the original and has been
replaced.

**Rhubarb — verified, but the tense is wrong.** The ruling is real and quotable:
*C. J. Tower & Sons v. United States*, 19 Cust. Ct. 12, C.D. 1060, 11 July 1947,
following *Nix v. Hedden* and holding that use controls — *"The chief use of
rhubarb is that of a fruit."* But it construed the Tariff Act of 1930, long
replaced, and US customs has classed rhubarb as a vegetable since at least 2005
(CBP ruling NY R02369). A student repeating the sentence as current US law would
be wrong. The live version is better for a French reader anyway: Council
Directive 2001/113/EC counts rhubarb stalks as fruit, which is why rhubarb
preserve may be sold as *confiture*.

**Pink peppercorn — the ending is unverified.** The 1982 action is documented
(New York Times, 31 March 1982), but the grounds in the entry are wrong: the FDA
said the berries *"can cause a severe toxic reaction"*, not allergy — the trigger
was a report that *Schinus terebinthifolia* is a poison-ivy relative. And there
is **no primary record of the ban ever being lifted** — no FDA notice, no
Federal Register entry, no date. Every account traces to that same article.
Cutting against the tidy ending: 21 CFR 182.20 still lists only *Schinus molle*,
not the Réunion species.

**Cerignola — one half right, two wrong.** The DOP name is verified: Commission
Regulation (EC) No 1904/2000 registers *La Bella della Daunia*. But "well under
140 fruits to the kilo" is **not in the register** — the specification fixes
fruit weight at 6–30 g, i.e. 33 to 167 per kilo, so it permits fruit smaller
than the claim. And "largest table olive in commerce" is a growers' claim; the
International Olive Council's world catalogue has no Cerignola entry at all.

## Waiting for you

1. ~~Three entries say something the sources do not support.~~ **Corrected
   18/09, both languages.** Rhubarb keeps "legally a fruit" — Gabriel's call and
   the right one: the EU jam directive is live law and it is the law that
   governs the reader, so what was stale was the 1947 US court as the *reason*,
   not the claim. Pink peppercorn now says what the FDA said (a severe toxic
   reaction, not allergy) and admits no document dates the lifting. Cerignola
   carries the register's 6–30 g and attributes "largest" to the growers.
2. ~~Génépi's date.~~ **Corrected 18/09** — the cap holds, first set in 2021 and
   renewed since, which is true without naming a superseded decree.
3. **The nuts role**, if seasoning is the wrong home for them.
4. **Five buckets still run uniform in places** — the cellar is fixed, but
   43 fresh herbs share `tender + moist` and 39 liquid condiments share
   `smooth + moist`. The grains' uniformity I would defend; dried beans really
   are alike in the state a cook meets them.

## Not done

**The thirteen thin dishes.** I could not establish which thirteen — the label
came from a session summary and no document lists them by name. Point me at them
and it is short work.

## Numbers

| | |
|---|---|
| entries given a texture | 1 838 |
| branches given a texture | 66 |
| vocabulary | 23 tags, five axes |
| structural faults remaining | 0 |
| controls caught | 5 of 5 |
| audit rejections applied | 17 |
| re-tagged in the second pass | 99 |
| claims verified / corrected / unverified | 2 / 2 / 1 |
| agents | 14 |
