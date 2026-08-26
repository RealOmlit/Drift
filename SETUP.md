# Making Drift real — Supabase in 5 minutes

The app is now a **real chat product**: real accounts, real messages persisted in
Postgres, realtime sync between actual users, and a genuine online counter
(presence). There are no demo bots, no seeded rooms and no fake numbers anymore.

It talks to [Supabase](https://supabase.com) (free tier is enough), which keeps
hosting on GitHub Pages possible.

## 1. Create the database

1. Sign up at <https://supabase.com> → **New project** (any name, pick a region).
2. When it's ready open **SQL Editor → New query**.
3. Paste the entire contents of [`supabase-setup.sql`](./supabase-setup.sql) → **Run**.
   You should see `Success. No rows returned`.

## 2. Email confirmation & the "localhost refused to connect" fix

New signups get a Supabase confirmation email. On fresh projects its **Confirm**
button redirects to `http://localhost:3000` — that's what produces
*"This site can't be reached · ERR_CONNECTION_REFUSED"*. Fix it one of two ways:

**Option A — skip verification entirely (recommended for friends & family):**
**Authentication → Sign In / Up → Confirm email: OFF.** People log in the
moment they sign up, and nobody can ever get locked out of their account.

**Option B — keep verification (works properly):**
1. **Authentication → URL Configuration**
   - Site URL: `https://YOUR-USERNAME.github.io/YOUR-REPO/`
   - Redirect URLs: add `https://YOUR-USERNAME.github.io/YOUR-REPO/**`
2. Now *Confirm* lands on your live login page and signs the user straight in.
3. If someone closes the tab before confirming, their account is **not lost**:
   logging in shows a *"Resend verification link"* button.

> The app always tells Supabase to return users to your current host
> (`emailRedirectTo`), so step B-1 only needs doing once per project.

**Optional — send auth emails from Gmail instead of Supabase's sender:**
Project Settings → Authentication → SMTP Settings: enable custom SMTP with
host `smtp.gmail.com`, port `465`, username = your Gmail address, password =
a 16-character Google **App Password** (Security → 2-Step Verification →
App passwords). Verification mail then arrives from your Gmail with far higher
limits than Supabase's built-in sender (which caps at ~2 emails/hour).

## 3. Wire the keys

In your project: **Project Settings → API**. Copy two values into
[`js/config.js`](./js/config.js):

```js
SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...long-public-anon-key...',
```

(The anon key is safe to commit — security is enforced by row-level security,
not by hiding this key.)

## 4. Deploy / test

Refresh the site. The "Setup required" banner disappears once valid keys are in
`js/config.js`. Create an account, make a room, open the site in a second
browser profile with another account — you'll see each other's messages appear
live and the online counter reflect reality.

## 5. Real emails via Gmail (Edge Function)

Drift sends mail through a Supabase **Edge Function** (`supabase/functions/send-email`),
so your Gmail password never touches the browser. The function verifies the
caller's Supabase session and rate-limits to 5 emails/hour/user.

1. **Gmail App Password** — in your Google Account enable 2-Step Verification,
   then open *Security → App passwords* and create one (16 characters).
   A regular account password will NOT work.
2. **Install the CLI** — `npm i -g supabase`, then `supabase login`.
3. **Deploy + set secrets** (run inside this repo):

   ```bash
   supabase functions deploy send-email --project-ref YOUR-PROJECT-REF
   supabase secrets set GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD=abcdwxyzabcdwxyz
   ```

That's it — new signups now receive a branded welcome email, and any signed-in
page can send via `Email.send({ to, subject, html })` from [`js/email.js`](./js/email.js).

## Notes & limits

- **Zephyr AI** is wired to [AIML API](https://aimlapi.com) (OpenAI-compatible)
  via `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` in `js/config.js`. ⚠️ A key in
  front-end code is public — expect strangers to see it. For production, move
  it into a Supabase Edge Function and set `AI_PROXY_URL` instead. If Zephyr
  answers with an "out of funds" notice, top up at
  <https://aimlapi.com/app/billing>.
- **XP / streaks / daily quests** are per-user gamification stored in your own
  profile row — real to you, computed client-side.
- **Blocking/muting** someone is enforced locally in your browser; reports are
  stored in the `reports` table for whoever operates the project.
- Passwords, sessions and emails are handled by Supabase Auth (never stored in
  the app's own storage).

## 6. Photos & custom avatars

Run [`supabase-setup-images.sql`](./supabase-setup-images.sql) in the SQL Editor
(same place you ran the main setup). It adds:

- `profiles.avatar_url` — custom profile photos (upload from your profile page)
- Two public Storage buckets: `avatars` and `chat-images`
- Policies so users can only write inside their own folder

Chat image posting runs every picture through an on-device NSFW classifier
(NSFW.js) **before** upload — blocked images never leave your browser.
