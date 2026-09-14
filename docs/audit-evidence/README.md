# Audit evidence — 14 September 2026

Raw results behind [`../audit-2026-09-14.md`](../audit-2026-09-14.md).

| file | what it holds |
|---|---|
| `gi_verdicts2.json` | all 176 protected-designation claims against the EU register |
| `sign_changes.json` | the 17 records changed, each with the register line that justified it |
| `swiss_register.json` | the Swiss federal AOP/IGP register as parsed, 42 products |
| `chef_stars.json` | 45 Michelin star claims, each with the sentence quoted from the page opened |
| `gbif_latin_names.json` | all 1 335 latin names against the GBIF backbone |
| `price_flags.json` | the 3 records whose printed price contradicts their band |

Scripts (`gi_match2.py`, `controls.py`, `price.py`, `gbif.sh`, `wiki.sh`) read
working copies under `/tmp/draw/`; they are kept for the method, not to be re-run
as-is. `controls.py` is the one that matters — it proves the designation matcher
goes red on a known-bad claim, which is why the CONFIRMED counts mean anything.

The EU register itself is one POST:

```bash
curl -s -X POST 'https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/gi-applications/filter' -H 'Content-Type: application/json' --data '{"lang":"en","first":0,"rows":5000,"sortOrder":0,"sortField":"statusDate","filters":[]}'
```
