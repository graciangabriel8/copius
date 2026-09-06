# Instagram — launch checklist

Everything that can be prepared here is prepared. What remains needs your hands,
because it involves your account and your credentials.

## 1. Profile picture

`brand/copius-profile.png` — 1080×1080, the cornucopia with COPIUS beneath,
centred on the mark's own bounding box so the circular crop clips nothing.

On the phone: open **https://copius.fr/brand/copius-profile.png** and long-press to save.

## 2. Bio

150 characters is the limit. This fits, with the count that does the work
sitting first:

```
1,800+ ingredients. 130+ techniques. 55+ dishes.
An illustrated atlas of cooking — EN / FR
contact@copius.fr
```

111 characters. Floors, not counts — the catalogue only grows, so a floor
stays true while an exact figure is right for about a week and wrong after.
The live numbers belong on the site, where the stat line computes them.

Raise a floor only when it has been comfortably passed, never to the current
number: it goes stale the same day.

Link field: `https://copius.fr`

The bio link is the only clickable link Instagram gives you, so it has to be
the site rather than anything else.

## 3. The three pinned posts

`brand/pinned/` holds them, already sliced to 1080×1440 — the size the profile
grid crops to since January 2025, so they display uncropped.

**Post them in this order.** The grid fills newest-first, left to right, so the
rightmost panel is published first:

1. `1-right-safran.png`
2. `2-middle-huitre.png`
3. `3-left-truffe.png`

Then pin all three. `assembled-preview.png` shows what they form together.

Get the order wrong and the wordmark reads backwards.

## 4. Automated daily posting

The full setup is in `INSTAGRAM.md`. It is about an hour, all in a browser, and
needs no App Review — that only applies to apps acting on other people's
accounts.

Once the token and user id are in the repository secrets, the job posts the same
ingredient the website shows that day, with a bilingual caption, at 08:00 UTC.

Cards are pre-rendered for 400 days and served from `copius.fr/social/`.

## Order

The profile picture, bio and pinned posts first — an account with no identity
converts nothing. Automation after, because it only matters once someone is
looking.
