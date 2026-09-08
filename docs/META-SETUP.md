# Meta setup — step by step

The goal is two values in the repository's secrets: an access token and an
Instagram user id. Everything below leads there.

No App Review is needed. That only applies to apps acting on other people's
accounts; yours acts on your own.

---

## 1. Instagram account → Professional

In the **Instagram app on your phone**:

- Your profile → **☰** (top right) → **Settings and privacy**
- **Account type and tools** → **Switch to professional account**
- Pick **Creator** or **Business**. Either works.

Free, reversible, and the publishing API does not exist without it.

---

## 2. Create the Meta app

At **developers.facebook.com**, logged in:

- **My Apps** (top right) → **Create app**
- **App name**: `Copius` — internal only, nobody sees it
- **App contact email**: `contact@copius.fr`
- When it asks what you want your app to do, the option you need leads to a
  **Business** app type. If you are offered use cases rather than types, choose
  **Other** → **Next** → **Business** → **Next**.
- **Create app**, confirm your password if asked

---

## 3. Add Instagram, on the right path

In the app dashboard:

- Find **Instagram** in the product list → **Set up**
- In the left menu you now want:
  **Instagram → API setup with Instagram business login**

That is the path that needs **no Facebook Page** and only two permissions. If
you find yourself on a screen asking to connect a Page, you are on the Facebook
Login path — go back and take the Instagram business login one.

---

## 4. Generate the token

Still on **API setup with Instagram business login**, there are three numbered
sections. You want section **3, "Set up Instagram business login"** — but first:

- In section **1, "Generate access tokens"**, find your Instagram account
- Click **Generate token** beside it
- Complete the Instagram login and approve
- **Copy the token immediately** — it is shown once

While you are there, note the **Instagram user id** displayed next to the
account. If it is not shown, get it by pasting this into a terminal with your
token in place of `TOKEN`:

```
curl -s "https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=TOKEN"
```

It returns your `user_id` and `username`.

---

## 5. Put both into the repository

At **github.com/graciangabriel8/copius** →
**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Two secrets:

| Name | Value |
| --- | --- |
| `IG_USER_ID` | the numeric id |
| `IG_ACCESS_TOKEN` | the token |

Never paste either into a chat, a file, or a commit. This page is the only
place they belong.

---

## 6. Test it

**Actions** tab → **Daily ingredient to Instagram** → **Run workflow**.

Check Instagram before leaving it on the 08:00 UTC schedule.

---

## The thing that will break it later

Long-lived tokens last **60 days** and cannot be revived once expired — you
have to issue a new one.

The `refresh-token` job renews it on Mondays and writes the new value straight back
into the secret, but only if a third secret exists:

| Name | Value |
| --- | --- |
| `SECRETS_PAT` | a fine-grained personal access token with **Secrets: write** on this repo |

Without it the job logs a warning and the integration dies quietly about two
months later.
