# Daily ingredient → Instagram

The site already picks one ingredient per day from a pure function of the date.
This posts that same ingredient, automatically, with no server.

## How it works

1. `tools/build-social.sh` renders every ingredient to a 1080×1080 JPEG plus a
   bilingual caption. Run it on the Mac; commit `social/`.
2. GitHub Pages serves those JPEGs at public HTTPS URLs — which is exactly what
   Instagram's API requires, since it fetches the image rather than accepting an
   upload.
3. `.github/workflows/daily-instagram.yml` runs at 08:00 UTC, works out today's
   ingredient with the same formula the site uses, and publishes it.

Nothing is generated at post time, so the daily job cannot fail on rendering.

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
have to issue a new one. The `refresh-token` job renews it weekly and writes the
new value straight back into the repository secret, but only if `SECRETS_PAT`
exists. If it doesn't, the job logs a warning and the integration dies silently
about two months later.

## After adding ingredients

```sh
sh tools/build-social.sh
git add social && git commit -m "Social: rebuild cards" && git push
```

The rotation is a full cycle: every ingredient appears exactly once before any
repeats. At 510 entries that is a 17-month cycle; at 1,857 it is 5.1 years.

## Limits worth knowing

- 100 API-published posts per rolling 24 hours. This uses one.
- JPEG only. Instagram will not accept SVG or PNG, and will not accept bytes —
  the image must be reachable at a public URL.
- A carousel counts as one post and holds up to 10 slides, which is the natural
  home for an EN slide plus an FR slide if you ever want that.
- Captions carry no clickable link. The only clickable link on Instagram is the
  one in the profile bio, so put the site there.
