# Daily ingredient → Instagram

One ingredient a day, in an order fixed in advance, posted automatically with
no server.

## How it works

1. `social/schedule.json` says which ingredient goes out on which day: a start
   date and one id per day, written once by `tools/build-schedule.py` as a
   seeded shuffle of every ingredient (no two consecutive days from the same
   family). Re-running it only appends ingredients that are new to the data;
   a day already scheduled never moves.
2. `tools/build-social.sh` renders the next 400 scheduled days to 1080×1080
   JPEGs. Run it on the Mac — the rasteriser is `qlmanage` — and commit
   `social/`.
3. GitHub Pages serves those JPEGs at public HTTPS URLs — which is exactly what
   Instagram's API requires, since it fetches the image rather than accepting an
   upload.
4. `.github/workflows/daily-instagram.yml` runs at 10:17 Paris, reads today's
   id from the schedule, and publishes it. The bilingual caption is produced
   there and then by `make-card.py --caption`, which needs nothing but Python —
   so an edit to the caption reaches the next post without a regeneration step
   to forget.

The picture is never generated at post time, so the daily job cannot fail on
rendering. To read a caption before it goes out:

```
python3 tools/make-card.py --caption 2026-09-20
```

## Two things that cannot be undone

**A published caption cannot be edited through the API.** The only writable
field on a live post is whether comments are on: the media node documents one
update call, `POST /{ig-media-id}`, and it takes `comment_enabled` and nothing
else. Deleting a post needs the Facebook-Login product, which this account is
not on. So a caption is fixed the moment `media_publish` returns, and any fix
after that is done by hand in the app.

**Which is why the loi Évin mention is in `caption()`.** CSP art. L3323-4
requires the health message on a communication in favour of an alcoholic drink,
and about nine days in four hundred draw one — the `cellar` family carries it by
default, so a bottle added to that family later is covered without anyone
remembering. `NOT_A_DRINK` in `tools/make-card.py` lists the vinegars and musts
that sit in the same family and do not need it.

## One-time setup (about an hour, all in a browser)

**You do these — never paste a token into a chat, a file, or a commit.**

1. **Instagram** → Settings → switch the account to **Professional**
   (Business or Creator; both work, it's free and reversible).
2. **developers.facebook.com** → My Apps → Create App → type **Business**.
3. In the app, add the product **Instagram** and choose
   **Instagram API setup with Instagram login**. You do *not* need a Facebook
   Page on this path.
4. Under that setup, add your own Instagram account as an **Instagram Tester**,
   then accept the invitation from Instagram → Settings → Apps and websites.
5. Generate a token with the scopes `instagram_business_basic` and
   `instagram_business_content_publish`. Copy the **Instagram user ID** too.
   No App Review is needed — that only applies to apps acting on *other
   people's* accounts.
6. In this repo: **Settings → Secrets and variables → Actions → New secret**
   - `IG_USER_ID` — the numeric id
   - `IG_ACCESS_TOKEN` — the long-lived token
7. Optional but recommended: a fine-grained personal access token with
   **Secrets: write** on this repo, saved as `SECRETS_PAT`. Without it the
   access token has to be replaced by hand every 60 days.

Then run the workflow once by hand: **Actions → Daily ingredient to Instagram →
Run workflow**. Check Instagram before leaving it on the schedule.

## The one thing that will break it

Long-lived tokens last **60 days** and, once expired, cannot be revived — you
have to issue a new one. The `refresh-token` job renews it on Mondays (Meta
refuses to refresh a token under 24 h old, so not daily) and writes the new
value straight back into the repository secret, but only if `SECRETS_PAT`
exists. If it doesn't, the job logs a warning and the integration dies silently
about two months later.

## When the cards run out

Data edits never invalidate a card: the schedule pins each date to an id, and
an entry merged away is skipped forward to the next scheduled one that still
exists (the job logs a warning naming both). The only maintenance is extending
the window before the last built card is posted — the job warns 40 days out,
and fails with this exact command once the schedule itself is exhausted:

```sh
python3 tools/build-schedule.py     # appends any ingredient not yet scheduled
sh tools/build-social.sh            # the next 400 scheduled days
git add social && git commit -m "Social: extend the schedule" && git push
```

Every ingredient appears once before any repeats: 1,852 entries is a five-year
schedule. Adding an ingredient puts it at the end, not in tomorrow's slot.

## Limits worth knowing

- 100 API-published posts per rolling 24 hours. This uses one.
- JPEG only. Instagram will not accept SVG or PNG, and will not accept bytes —
  the image must be reachable at a public URL.
- A carousel counts as one post and holds up to 10 slides, which is the natural
  home for an EN slide plus an FR slide if you ever want that.
- Captions carry no clickable link. The only clickable link on Instagram is the
  one in the profile bio, so put the site there.
