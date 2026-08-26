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

## 2. Turn off email confirmation (optional but recommended)

**Authentication → Providers → Email**: disable *Confirm email* so people can
log in immediately after signup. Leave it on if you want verified emails —
signup will then say "check your inbox" before first login.

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

## Notes & limits

- **Zephyr AI** is disabled until you connect a real model endpoint
  (`AI_ENABLED` in `js/config.js`). No fake responses.
- **XP / streaks / daily quests** are per-user gamification stored in your own
  profile row — real to you, computed client-side.
- **Blocking/muting** someone is enforced locally in your browser; reports are
  stored in the `reports` table for whoever operates the project.
- Passwords, sessions and emails are handled by Supabase Auth (never stored in
  the app's own storage).
