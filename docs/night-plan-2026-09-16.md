# Night plan — 16 September 2026

Written to be executed when woken, not read as prose. Each task states what it
touches, what proves it worked, and whether it ships or waits for Gabriel.

**The shipping rule for tonight.** Data that nothing reads yet can ship: it adds
a field without changing a single verdict, so a mistake is invisible and
reversible. Anything that changes what the lab *says* waits for review, because
being wrong in front of a school costs more than being slow. Texture is
therefore split in two — the data lands tonight, the engine reads it with
Gabriel awake.

---

## Task 1 — the texture vocabulary (do this first, alone, ~30 min)

Everything else depends on it. The 35 flavour tags work because they are a
closed list; agents given an open one will write "crunchy", "crisp" and
"crispy" into three different entries and the engine will read three textures
where a cook sees one.

Proposed closed set, 22 tags on five axes. **Gabriel reviews this before Task 2
runs** — it is the one judgement in the night that is his and not mine.

| axis | tags |
|---|---|
| yield | `soft` `tender` `firm` `hard` `tough` |
| surface | `crisp` `crunchy` `brittle` `smooth` |
| body | `creamy` `silky` `gelatinous` `viscous` `airy` |
| moisture | `juicy` `moist` `dry` |
| grain | `fibrous` `granular` `flaky` `powdery` `chewy` |

Rules to carry into the briefs: 2–3 tags per entry, never more; the raw state
unless the entry is only ever eaten cooked (dried beans are `hard` `dry`, not
what they become); one tag per axis at most, so nothing is both `soft` and
`firm`.

## Task 2 — texture across 1 838 entries (workflow, 9 agents)

Seven generation agents over balanced buckets, two auditors. Nine agents, under
the ten-agent ceiling, decided here rather than read off any model's output.

| bucket | entries |
|---|---|
| proteins — meat, cuts, seafood, shellfish, roe | 403 |
| condiments, spices, herbs, flowers | 410 |
| vegetables, mushrooms, seaweed | 316 |
| fruits, sweet pantry | 209 |
| dairy, fats | 176 |
| grains, legumes, nuts | 167 |
| cellar, infusions, texture agents | 157 |

Each agent returns `id → tags` as JSON only. No agent edits a data file; the
parent writes them, so a bad batch is dropped rather than half-applied.

**Auditors** take the merged set and check: every tag inside the closed list,
2–3 per entry, no two tags from one axis, and a sample of 60 spot-checked
against what the entry's own `tip` prose already says about how it eats.

**Controls before any of it is believed.** A clean audit means nothing unless
the same check goes red on a known-bad case in the same run: seed five
deliberately wrong entries (a `crisp` cream, a `soft` hazelnut, an entry with
four tags, one with `soft`+`firm`, one with an invented tag) and the auditors
must catch all five. If they miss one, the pass is void.

**Ships tonight** as a new `texture:[...]` field. Nothing reads it, so no
verdict moves. `validate.js` green and the site at the same score for a
reference plate before and after is the proof.

## Task 3 — texture on the 66 tree branches (me, ~40 min)

Sixty-six values, not 1 838, and they are where texture earns its keep first:
purée and frites are the same potato and the whole point is that they do not
eat alike. Hand-written, not generated — at this size the cost of an agent
exceeds the cost of doing it.

Ships tonight, same reasoning: inert data.

## Task 4 — audit the role map (me, ~30 min)

`roleOf` is family-derived with 14 overrides, and exactly three were ever
checked. Sweep all 1 838 for ingredients whose family and plate role part
company — cheeses reading as `fat` when they are the protein of the dish, tofu,
cured fish, anything in `condiments` that is really a sauce.

**Report only.** Produces a list with a proposed override per row, for Gabriel
to accept or reject in the morning. Roles move the guided slots and the
templates, so this is not a change to make while he sleeps.

## Task 5 — the four unverified prose claims (me, background)

Rhubarb 1947, pink peppercorn 1982, Nyons 1994, Cerignola. Plus génépi, which
needs the Savoie préfecture. Primary sources only — open the page, never cite a
search summary.

**Report only**, into `docs/audit-evidence/`. Any claim that fails gets flagged,
not silently rewritten: the prose is his.

## Task 6 — re-measure the 13 thin dishes (me, ~15 min)

They were flagged against the old grade, which has since changed twice. Cheap,
and it may retire some of them.

---

## What is deliberately not in the night

**New tree branches for more ingredients.** Forms exist for 11 of 1 838 and the
selector vanishing for everything else reads as broken — but a branch carries
technique prose and tips in his voice, in two languages. That is authored
content, and it is reviewed, not generated overnight.

**The starter template.** His corpus splits savoury from sweet and says nothing
about starters; the shape is my inference and needs a cook, not another pass
over the same data.

**Wiring texture into the engine.** The data lands tonight; what the lab *says*
about it changes with him awake.

## On waking, in order

1. The texture vocabulary, for approval — Task 2 cannot start without it
2. The role-map findings, to accept or reject
3. The claims report
4. Then, together: wire texture into the plate engine and see what it changes
