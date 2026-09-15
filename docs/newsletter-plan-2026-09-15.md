# Newsletter — what the law actually requires, and the plan

**15 September 2026.** Four research lanes, two adversarial auditors whose brief
was to refute rather than confirm, and one article I opened myself on Légifrance
because the two auditors disagreed about its number.

## The headline

**The blocker was never French law, and it was never really the address.**

Brevo's Terms of Service, clause 1.3, version dated 1 October 2025:

> *"You also agree to use our Services for the sole purpose of your professional
> activity, excluding any use as a non-professional or consumer."*

Gabriel has no legal entity and publishes a free site as a private individual.
**He was never eligible for Brevo**, address or no address. The postal-address
screen he hit is a US artefact: the FTC's CAN-SPAM Act requires a valid physical
postal address in commercial email, and US-facing providers build it into
onboarding for every customer regardless of jurisdiction.

No French text puts a postal address inside a newsletter message. That was
checked against four candidate homes — CPCE L34-5, CNIL's two prospection pages,
and CNIL's *règles d'or* — and none contains one. CNIL places the controller's
coordonnées on the **unsubscribe page**, not in the message.

## The one thing to fix now — free, ten minutes

This is the audit's most load-bearing finding, and it cuts against the comfortable
answer.

**LCEN article 1-1**, in force since 23 May 2024 (created by the loi SREN
n° 2024-449, article 48 — the old "article 6-III" citation is stale). Read on
Légifrance directly, because Légifrance refuses automated fetches and the two
auditors cited different numbers.

Section II, verbatim:

> *"Les personnes éditant à titre non professionnel un service de communication
> au public en ligne peuvent ne tenir à la disposition du public, pour préserver
> leur anonymat, que le nom, la dénomination ou la raison sociale et **l'adresse**
> du fournisseur de services d'hébergement, **sous réserve d'avoir communiqué à ce
> fournisseur les éléments d'identification personnelle mentionnés au I**."*

Two conditions, and the site currently meets neither cleanly.

**1. The host's postal address must be published, not just its name.**
`confidentialite/index.html` says *"Le site est hébergé par GitHub Pages (GitHub
Inc.)"* — a name with no address. The exemption is what lets Gabriel keep his own
address off the page, and it is conditioned on publishing the host's.

*GitHub's postal address is not asserted here.* It was not on the GitHub pages
opened (company information 404s, `/contact`, the ToS and the DMCA policy carry
none). It has to be found before it is published — the US Copyright Office's
designated-agent directory is the authoritative place to look.

**2. GitHub must hold his identifying details.** Section I 1° for a personne
physique is literally *"leurs nom, prénoms, domicile et numéro de téléphone"*. A
default GitHub account holds a username and an email. Until those four items are
actually supplied and proof kept, the paragraph he is relying on has no condition
satisfied.

This is true today, with no newsletter, and it is the only item on this list that
is already overdue.

## Can he run a newsletter now? Yes, with one discipline

**CPCE article L34-5** defines prospection directe as promoting, directly or
indirectly, *"des biens, des services ou l'image d'une personne vendant des biens
ou fournissant des services"*. He sells nothing, so the opt-in regime is
commercial by construction and probably does not reach a letter that promotes
nobody's goods.

**The auditor's correction, which changes how it must be written:** the text says
*indirectement*, and it does not require the seller to be the sender. A culinary
letter that names producers, wines, books, shops or restaurants — or links to
them — is reachable on the text alone. Enforcement also runs through the DGCCRF,
not only the CNIL, so CNIL's non-commercial doctrine is not a defence there.

So the discipline is: **the letter promotes no one's goods.** No affiliate links,
no product placement, no "buy this from X". The day that slips, or the day he
sells anything, the commercial regime applies.

### What must be in each message

Two things, per CNIL:

> *"chaque sollicitation doit obligatoirement permettre à la personne concernée
> de prendre connaissance de l'identité de l'organisation qui l'émet ainsi que
> d'exprimer, si elle le souhaite et par un moyen simple, son refus"*

Sender identity — *Copius, copius.fr,* plus a real reply address — and a working
unsubscribe link. Not a postal address.

### Consent

Take a real opt-in even though the non-commercial carve-out only requires
opt-out, because consent has to be **provable** and the burden sits on him.
Double opt-in is **not legally required** in France; it is the cheapest evidence
that it was given.

The privacy notice needs **ten** items for a consent-based list: CNIL's nine
mandatory mentions plus the right to withdraw consent, which applies precisely
because the basis is consent.

## The provider: EmailOctopus

Eight were compared. It is the only one that answers every question the right way.

| | |
|---|---|
| admits individuals | terms define a consumer as an individual buying for personal use |
| **hides his address** | it substitutes **its own** address in the footer — he gives his real one to EmailOctopus privately, subscribers never see it |
| data residency | subscriber lists on AWS **Ireland**, inside the EEA |
| free tier | **2,500 subscribers, 10,000 emails/month** |
| first paid step | $9/month billed yearly, which removes the forced referral link |

The address-substitution feature is the whole answer to the original problem, and
it is the reason this plan needs neither a domiciliation nor his home address.

**The gap, stated honestly:** EmailOctopus's Data Processing Terms are
conditioned on the customer being a business (clause 23). Running a public
newsletter is outside GDPR's purely-personal-activity exemption, so he *is* a
controller and Article 28 would normally want a processor contract. Their DPA
hook only fires "to the extent that you are a business". It is a paper gap, not a
practical one, and it exists at Tally too — but it should be known rather than
discovered.

**Rejected:** Brevo (terms bar him), Mailchimp (no address substitution; free
tier only 250 contacts), Ghost (no free tier, $18/month), Substack (US law, and
it takes the reader relationship), Listmonk (needs a server he does not have).

## Collecting addresses from a static site

GitHub Pages runs no server-side code, so the address must leave copius.fr at the
moment of submission. It also cannot set HTTP response headers, so a CSP is only
possible through a `<meta>` tag.

**The simple route:** EmailOctopus's free tier includes a hosted form. The
subscriber's browser talks to EmailOctopus directly — no server, no database,
nothing GitHub Pages cannot serve. An embedded script or iframe triggers a cookie
banner; a plain HTML form posting to their endpoint does not.

**The self-owned route, if the paper gap matters:** a plain form posting to a
**Scaleway** serverless function in Paris — 1,000,000 requests/month free — which
records a pending address, emails a confirmation link, and only then writes it to
a list he holds. That is the version where "the form is handled by a function
running in Paris" is a true sentence.

**Rejected:** Formspree (US, and `formspree.io/legal/dpa/` returns 404), Netlify
Forms (detection happens at Netlify build time; a GitHub Pages site is never
parsed), Cloudflare Workers (EU-only processing is an Enterprise add-on, so "your
address stays in the EU" cannot honestly be written).

## The privacy page changes in the same commit

`confidentialite/index.html` currently says, in both languages:

> *"Il n'y a ni formulaire, ni liste de diffusion, ni mesure d'audience… Aucun
> prestataire d'emailing, aucune liste de diffusion."*

The first subscriber makes that false. It must be rewritten in the **same commit**
that ships the form — never after.

## Order of work

1. **Now, free.** Find GitHub's postal address and publish it beside the host's
   name; give GitHub nom, prénoms, domicile, téléphone and keep proof. This is
   already required and has nothing to do with the newsletter.
2. **When he wants the list.** EmailOctopus account, address substitution on,
   hosted form linked from copius.fr, double opt-in, privacy page rewritten in
   the same commit.
3. **Not now.** Domiciliation (11–25 €/month, and vendors sell it to businesses —
   with no entity he can only buy a mail box, which its own vendor says is not a
   valid address), association loi 1901, micro-entreprise. Every one of these is
   a consequence of registering, not of writing a newsletter.

**Registering is the thing to be slow about.** The day he does, the mentions
légales put his name, his *domicile* as the statute words it, his phone number
and his SIREN back on the page — and INSEE non-diffusion does nothing about that.

## Known unknowns

- GitHub's postal address — not found on any GitHub page opened.
- Whether EmailOctopus's DPA reaches a private individual.
- Brevo's onboarding flow itself; `help.brevo.com` returns 403 to automated
  fetches. Gabriel's first-hand account is the record — and it is moot, since the
  professional-use clause excludes him before that screen.
- Whether his OVH plan qualifies for OVH's own mailing-list feature.
