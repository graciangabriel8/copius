# Night report — 16/17 September 2026

Shipped to v160. Everything below is live except where it says otherwise.

## Done

**Texture, all 1 838 entries and all 66 branches.** Two or three tags each from
the closed 22-tag vocabulary. Seven agents assigned, two audited. The field is
inert — nothing reads it, no verdict moved, and a reference plate (salmon, dill,
lemon) scores 78 before and after. The lab still says plainly that it knows
nothing about texture, because it still doesn't.

**The audit is worth believing, which is the point of the controls.** Five
deliberately wrong rows went into the audit set without the auditors being told:
crème fraîche called crisp, a hazelnut called soft, one row with four tags, one
with two contradicting yield tags, one with invented tags. **All five were
caught.** Seventeen real rejections followed and all seventeen were applied. The
sharpest:

- seven whole grains (emmer, freekeh, green spelt, khorasan, Job's tears,
  hominy, wild rice) tagged `chewy` — what they become after forty minutes in
  water, not how a cook meets them
- three sesame pastes tagged `moist` when their own tips make water the failure
  mode: *"It seizes on contact with water"*
- gold and silver leaf tagged `brittle`, which is the one thing foil at that
  thickness is not — it drapes and tears

**The nuts family was missing from the role map.** Not a judgement call — a
hole. All sixty (almonds, walnuts, pistachios, sesame) were falling through to
"on the side", reachable by no guided template. Filed under seasoning, because
that role already holds what finishes a plate rather than composing it.
Overrule it if the kitchen says otherwise. `plate.js` now exposes a check that
names any family the map has forgotten, so the next one fails loudly.

**Two of the flagged prose claims verified**, against sources opened rather than
summarised:

- **Nyons** — *verified*. Decree of 10 January 1994, and earlier than its
  nearest rival, Les Baux-de-Provence (27 August 1997), so "first French olive
  appellation" holds.
- **Génépi** — *limit verified, date stale*. The préfecture confirms 120 brins
  per person per day across three génépi species. But the instrument it cites is
  **AP_2025-1142**, a 2025 arrêté. The entry says "a Savoie prefectoral decree
  of June 2021", which was the original and has since been replaced. The cap is
  right; the reference is out of date.

## Second pass (after the first report)

**The liquid gap is closed.** `fluid` is now the 23rd tag, on the body axis
opposite `viscous`. A vinegar is thin-flowing; a PX is thick-flowing; neither is
a damp solid, which is what `moist` means.

**The cellar was re-tagged and it needed it.** 89 of 157 rows changed, and
distinct tag-sets went 16 to 32 — the largest identical cluster fell from 47
entries to 35. The agent's own account of what the first pass got wrong:
clear eaux-de-vie, fino, dry vermouth and sercial are `fluid` where aged
brandies carrying glycerol are `silky` and a PX or a vin de paille is `viscous`;
gritty crystals (citric, tartaric, nigari) are granular where charcoal, xanthan
and koji spores are airy; and three liquids were miscoded as damp solids.

**The 86 doubtful entries were re-judged**, 13 changed. Two error classes, both
on moisture: thin liquids carrying no moisture tag at all, and a later state
leaking into the tag — gagome kombu tagged for what it does in water, sake kasu
for a paste that stays a lump.

**Texture now reads on the plate, with the form taken into account.** Potato
purée with cream and mascarpone trips *"nothing here resists the teeth"*; the
same plate with frites does not.

**It is deliberately not scored.** Measured over the trios and the chefs'
dishes against 4 000 random plates, texture separates real cooking from
ingredients drawn at random by **minus three points** — random plates score
*higher*, because a scattered set is texturally various by accident while a real
dish is focused. That is exactly what the flavour reading does, and the same
conclusion follows: it tells a cook about their own plate but cannot rank
plates. The grade stays 40% flavour, 60% accords.

## The three remaining claims

**Rhubarb — verified, but the tense is wrong.** The ruling is real: *C. J. Tower
& Sons v. United States*, 19 Cust. Ct. 12, C.D. 1060, decided 11 July 1947,
following *Nix v. Hedden* (the tomato case) and holding that use controls —
*"The chief use of rhubarb is that of a fruit."* But that construed the Tariff
Act of 1930, long replaced, and US customs now classes rhubarb as a vegetable
(CBP ruling NY R02369, 2005). A student repeating the sentence as current US law
would be wrong. There is a better and still-live version for a French reader:
Council Directive 2001/113/EC counts rhubarb stalks as fruit, which is why
rhubarb preserve may be sold as *confiture*.

**Pink peppercorn — the ending is unverified.** The 1982 action is documented
(New York Times, 31 March 1982) but the grounds in the entry are wrong: the FDA
said the berries *"can cause a severe toxic reaction"*, not allergy — the
trigger was a report that *Schinus terebinthifolia* is a poison-ivy relative.
And there is **no primary record of the ban being lifted at all** — no FDA
notice, no Federal Register entry, no date. Every account traces back to the
same 1982 article. Cutting against the tidy ending: the GRAS list at 21 CFR
182.20 still names only *Schinus molle*, not the Réunion species.

**Cerignola — one half verified, two not.** The DOP name is right: Commission
Regulation (EC) No 1904/2000 registers *La Bella della Daunia*. But "well under
140 fruits to the kilo" is **not in the register** — the specification fixes
fruit weight at 6–30 g, which is 33 to 167 per kilo, so it permits fruit smaller
than the claim. And "largest table olive in commerce" is a growers' claim only;
the International Olive Council's world catalogue has no Cerignola entry at all.

Each of the three came back with a suggested rewrite in the same register as
your prose. They are in the workflow output; I have not touched the entries —
the writing is yours.

## Waiting for you

**Three prose rewrites to accept or refuse** — rhubarb, pink peppercorn,
Cerignola. All three entries currently say something the sources do not support.

**~~The vocabulary has no tag for a thin liquid.~~ Closed — see above.** The auditor found it and it is
a real gap, not carelessness: vinegars, soy sauces, ponzu, verjuice, rose water
and kombucha all ended up as `moist`, which means a damp solid. A vinegar is
neither juicy nor dry nor moist. Worth closing before texture drives any
verdict.

**~~Six buckets ran on autopilot.~~ The cellar is re-tagged; the rest stand.** The cellar is the worst: 33 spirits
and fortified wines share an identical `smooth + silky`, so a kirsch, a grappa
and a vin jaune are indistinguishable. Fifty-one rows there had no
discrimination attempted. The grains' uniformity I would defend — dried beans
really are alike in the state met — but the spirits need a second pass.

**Eighty-four entries the assigning agents flagged as genuine doubts**, listed
in the workflow output. Offal, sea squirts, honeys, the chocolates, the
gelling agents. A cook's eye would settle most of them in an hour.

## Not done

**The thirteen thin dishes.** I could not identify which thirteen from the
records — the label came from a summary, and the audit docs do not list them by
name. Point me at them and it is a short job.

## Numbers

| | |
|---|---|
| entries given a texture | 1 838 |
| branches given a texture | 66 |
| structural faults after audit | 0 |
| controls caught | 5 of 5 |
| rejections applied | 17 |
| agents | 9 |
