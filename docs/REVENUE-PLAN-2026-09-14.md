# THE PLAN

**14 September 2026. Written against the repo at `/Users/gabrielgracian/Projets/ingredients-dictionary` and its git history, not against the brief.**

---

## 1. THE ANSWER

Copius earns nothing between now and June 2027, and that is the decision, not a delay.

The only asset here with a price today is neither the atlas nor the drawings — it is the documented, publicly verifiable fact that you shipped 3,764 pages, 1,836 bilingual entries, a working offline PWA and an automated daily publishing pipeline, alone, in twelve working days, and that sells as **labour to an employer**, not as a product to a customer.

So the site stays free, unchanged and indexed while it accumulates the first demand data it has ever had; the ten hours a week go to the E5 practical and to three job applications.

**Against your eight tests:**

1. *Why would anyone pay for a free website?* — Nobody does. Nobody is asked to.
2. *Do schools buy Wikipedia?* — No school is approached for money this year.
3. *Students with free school access won't buy.* — There is nothing to buy.
4. *Just save the link as an app.* — Correct, and they should. The PWA is the product and it is free.
5. *Would they just ask ChatGPT?* — For the writing and the pictograms, yes, and that is why neither is priced. For shipping and operating a 3,764-page bilingual site with a sitemap, a service worker and a GitHub Actions job that runs unattended every evening — no. That gap is what you are selling.
6. *Can an 18-year-old with 10 h/week deliver it?* — This plan costs about nine hours in four weeks. The five killed models cost 42–55 build hours each plus a permanent sales job.
7. *Does it leave the atlas open and indexed?* — Nothing moves, nothing gates, nothing changes.
8. *Is it honest?* — It requires you to correct one word in one unsent email and stop repeating one false premise. It requires you to mislead no one.

---

## 2. WHY THIS AND NOT THE OTHERS

- **Photocopiable assessment packs (€149/section).** Killed because an answer key is exempt from line-by-line verification only by the authority of its source, and you do not yet have that authority — you wrote the argument against yourself. 24 of the 42 build hours produce exactly the artefact class you had already declared worthless when a chatbot makes it.
- **Exam rehearsal (€19/candidate).** Killed by the exam's own cahier des charges: the candidate is given a networked computer and their own documentation during the hour you were selling. You would be drilling lookup in the one room where lookup is free.
- **Illustration licensing (€80–150/drawing).** Killed on disk. The files are vectors — the visitor already has, free, a better file than the one being sold.
- **Commissioned menu illustration (€240/pack).** Killed because its first build step was to print "1,835 original drawings, all by hand" beside a price list, and the corpus does not support that sentence.
- **Commissions with the atlas as portfolio (€250/drawing).** Same kill, one step removed: the portfolio being offered as proof of a hand does not contain the product.

All five died of one shared premise, which the brief you have been working from states explicitly and which is **false against the files**: *"Every entry carries an ORIGINAL hand-drawn illustration… the drawings are the one asset nobody else has."* Stop using that sentence. It has now generated five dead proposals.

---

## 3. OPPORTUNITIES

**A. The build record is the asset, and it is already public and dated.**
`git log` in the repo: first commit 2026-08-30T19:05+02:00, last 2026-09-13T21:45+02:00. 156 commits across 12 distinct working days, 39 of them on 8 September alone. 3,764 `index.html` files. 1,836 entries in English and 1,836 in French, written separately. A 322 KB sitemap, a service worker, `tools/build-pages.py`, `tools/build-social.sh`, and `.github/workflows/daily-instagram.yml` posting a two-slide carousel at 19:07 Paris with no server. Your own About page already calls you "a hospitality student and junior web engineer" — the site proves the first half and hides the second. Someone who is simultaneously BTS MHR and can do this is rare in French hospitality software. That rarity has a buyer, and the buyer is an employer.

**B. Free demand data you have never once looked at.**
Your privacy page promises, in French and English, no analytics: *"Aucun traceur, aucune analyse d'audience, aucun cookie publicitaire."* Keep that promise. Search Console is already verified and the sitemap already submitted (established), it sets no cookie, runs no script in a visitor's browser, and reports Google's side of the transaction. It is the only demand signal available to you and it accrues only from the day you start reading it. Every one of the five dead models was priced on a guess about a buyer because this number did not exist.

**C. You can test the school hypothesis for zero euros by deleting the ask.**
Your own GTM document at `/Users/gabrielgracian/Projets/ingredients-dictionary/docs/SCHOOLS-GTM-2026-09-13.md` opens with the right sentence — *"Step 0 — Decide what is paid for… If he cannot answer this, stop here; nothing downstream survives it."* You cannot answer it. But Step 1 of that document costs nothing and survives on its own: one teacher, one séance, no money. What you are afraid of is asking a teacher who grades you for €300. Asking a teacher to correct your work is the normal direction of that relationship and costs you nothing to be wrong about. Your About page already makes that request of professionals in writing.

**D. The burn rate is zero and holds indefinitely.**
GitHub Pages, free. Domain, roughly €12/year. No server, no Stripe, no subscription, no support inbox, posting automated a year ahead. Nothing forces a decision in 2026. Most 18-year-olds' projects cannot wait; this one can wait two years. That is an asset, and the five dead proposals all spent it.

**E. SNEE — statut national étudiant-entrepreneur.**
From your own research: free, BTS eligible, comités **3 November and 3 December 2026**. It needs no company, no capital and no revenue. It gives a referent, a recognised status, and a PEPITE network — which is the credential half of this plan. Application deadline preceding those comités: UNKNOWN, verify with the PEPITE for the académie de Lyon this month.

**F. One email closes or opens the entire school branch.**
`/Users/gabrielgracian/Projets/ingredients-dictionary/docs/mail-region-aura.md` is written and unsent. Its question 2 — whether an LDE/PopLab catalogue identifier is required, and whether that referencing is open to an independent author with no editorial structure — is a hard gate you cannot learn any other way, and it commits your school to nothing. Send it. One correction first, see Threat 2.

---

## 4. THREATS, RANKED BY WHETHER THEY WILL ACTUALLY HAPPEN

**1. The BTS. Near-certain, fires every week, largest loss.**
E5 partie pratique is coefficient 12, the heaviest single weight in the diploma, June 2027. Ten hours a week on a business is ten hours not on it. Each killed model costed 42–55 build hours plus a permanent hand-sell load, against a stated ceiling of €4,500–6,000 in the best case and €0–500 realistically. There is no version of this arithmetic where the business is worth the exam. This is the threat that ends the project, and it ends it quietly, by making you worse at the thing you are actually training for.

**2. One word, in one file, not yet sent. Very likely to fire if you do nothing.**
The live site is clean — I checked. No page claims the drawings are hand-drawn; all 55 matches for "hand-drawn" / "à la main" across the HTML are about food (saffron picked by hand, couscous rolled by hand). The alt text reads "drawn for Copius" / "dessiné pour Copius", 1,835 times: that is provenance, not craft, and it is defensible. But `img/` holds 1,835 SVG files of 654–1,118 bytes, median 789, every one carrying the same byte-identical style block and the same background circle. That is a generated pictogram set. The unsent AURA email says *"chacune accompagnée d'un dessin original."* Sent to a Région, or printed next to a price, that is the step that converts a defensible word into a commercial representation — pratique commerciale trompeuse, C. consom. art. L121-2, under your own name on your only distribution channel. **Fix the word before you send. Never put a price beside those files.**

**3. ChatGPT. Likely, and it is not the threat you think.** Four distinct mechanisms:

- **On your traffic — the real one.** The danger is not that a student asks a chatbot instead of visiting. It is that Google answers "qu'est-ce que le topinambour" *on the results page*, in an AI Overview, and the click never reaches copius.fr. Your entire distribution is one channel — Google organic — and that channel is being rebuilt right now by the company that owns it. Published studies through 2025 reported large click-through declines on informational queries carrying an AI Overview; the 2026 magnitude is **UNKNOWN**. The structural point stands regardless: a 3,764-page informational reference launched in 2026 is built on the single most exposed traffic type there is. Assume the ceiling is far below what the page count suggests, and measure it rather than assume it.
- **On anything you write.** Entry prose, exercises, corrigés, barèmes, captions — a chatbot produces an adequate version free and instantly. Two independent adversaries found this separately. Anything priced on writing loses.
- **On the drawings.** A two-tone monoline food pictogram is generated in seconds, or taken free from Noun Project, Lucide or Flaticon, who have shipped matching rights-clean food sets for a decade. Anything priced on the pictograms loses.
- **Where it does not reach you.** It does not deploy, operate, and keep running a bilingual static site with a service worker, a submitted sitemap, Search Console verification and an unattended daily publishing job. It writes code; somebody still has to make it work and keep it working on a real domain. Operating, not generating, is the only item on this page with a market price.

**4. The school relationship. Likely if you follow your own GTM doc.**
That document puts a €300 ask in front of your chef d'établissement in October 2026, with your DDFPT in the chain, inside the building where you are graded, in the year of your heaviest exam. The downside is not a lost sale. It is nine months of a changed relationship. Ask for use, not money, until after June 2027.

**5. Sunk-cost drift. Moderate, and it is the failure mode you are in right now.**
Five models, five kills. The next move that feels natural is a sixth model. The premise all five shared is that Copius must earn something soon. Nothing requires that. Hosting is free.

**6. Content rot. Moderate, slow, and self-diagnosed.**
Your About page already says prices go stale and some families are thin. 3,764 pages, one maintainer, no analytics. This does not end the project; it lowers the credential's value if it visibly decays. Corrections are cheap and worth the hour.

**7. Legal or régime error. Low, but only because you have not sold anything.**
Publishing a price list makes you a professionnel under LCEN art. 6-III and forces a published postal address — the exact blocker that already killed Brevo for you. And work sold as cession de droits d'auteur may route through URSSAF Artistes-Auteurs rather than the INPI guichet unique; two reviewers flagged it and neither could settle it. Both risks are eliminated entirely by not selling this year.

---

## 5. THE NEXT FOUR WEEKS

Nine hours total. Not forty. The rest is E5.

**Week of 15–21 September**

1. **Fix one word, then send one email.** Open `/Users/gabrielgracian/Projets/ingredients-dictionary/docs/mail-region-aura.md` and replace *"chacune accompagnée d'un dessin original"* with something true — *"chacune illustrée"* is enough. Then send it to `gratuite_manuels_scolaires@auvergnerhonealpes.fr`, to the attention of François Tessier. *Precondition: the word is corrected. Nothing else.* **30 minutes.** It commits your school to nothing; the draft's own "avant d'en parler à mon établissement" line handles that.

2. **Start the only measurement you are allowed.** Open Search Console, record today's baseline — impressions, clicks, top 20 queries, top 20 pages — into a dated file. Repeat 14 October and 14 November. *Precondition: none; verification already exists.* **30 minutes now, 15 each time after.** If naming it on the privacy page would sit better with you, one sentence costs nothing and is the more scrupulous option you have twice chosen unprompted.

**Week of 22–28 September**

3. **One teacher. One session. No money, and say so first.** Pick a cuisine or technologie/produits teacher — not the DDFPT, not the direction. Ask them to use copius.fr for one séance, or simply to tell you what is wrong in it. Open with "it is free and it stays free." *Precondition: you have nothing to sell, which as of this plan is true.* **One conversation.** You are asking them to correct your work, not to buy it.

4. **Ask three teachers one question:** when you want a new document or tool for a class, where do you get it? *Precondition: step 3 done with one of them.* **15 minutes.** Your own research marked this NOT FOUND — no survey exists for French hospitality teachers, so asking is the only data.

**Week of 29 September – 5 October**

5. **Apply to SNEE.** Comités 3 November and 3 December 2026; the application deadline precedes them by an amount that is UNKNOWN — confirm with the PEPITE for the académie de Lyon at the start of this week. *Precondition: none. It requires no company, no capital, no revenue.* **2 hours.**

6. **Write the page that turns the repo into a credential.** A short factual "how this is built": what it is, how many pages, how they are generated, what is automated, what runs unattended. No adjectives, no "hand-drawn", no prices. *Precondition: the drawings are described accurately — vector illustrations generated for the site.* **2 hours.** Your About page claims "junior web engineer" and shows none of the engineering; this is the artefact an employer or a PEPITE referent actually reads.

**Week of 6–12 October**

7. **Three applications.** To companies building software for restaurants and hospitality in France, for an alternance or first contract after June 2027, and for paid holiday work before it. Link copius.fr and the build page. *Precondition: step 6 done.* **3 hours.** Which firms are hiring: UNKNOWN, and building that list is part of the three hours. This is the only step in this document where money that already exists moves toward you.

8. **Ship nothing new to Copius.** Corrections only. *Precondition: none.* The site's job for the next nine months is to sit there, stay indexed, and accumulate Search Console data.

---

## 6. WHAT WOULD MAKE ME WRONG

One observation, and you can check it yourself without asking anyone.

**By 14 December 2026, either Search Console shows 1,000+ clicks per month from Google, or three unsolicited emails have arrived at contact@copius.fr from people who cook or teach for a living.** If either fires, demand exists, it is measured rather than assumed, and the verdict above is wrong — at that point you build what those people asked for and you charge for it, because you will finally have the one input every one of the five dead proposals was missing. If neither fires by December, the answer holds through June 2027 and you stop reopening it.

Two weaker signals that would change one branch each, not the plan:

- **If the Région replies that a 2026-27 edition is open and that referencing is open to an independent author** — that is a funded route where the school applies and you never sell. Re-examine it then. It does not change the BTS constraint.
- **If a teacher asks, unprompted, for it on paper for the lab** — the printable unlabelled plate is the one artefact that survived every adversary, for a precise reason: a drawing is verified by looking at it, so it needs no pedagogical authority you do not have. It is eight hours, it should be free and on the site, and it should be built the day someone asks and not one day earlier.