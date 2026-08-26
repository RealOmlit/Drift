# Drift ✦ Conversations in motion

<p align="center">
  <img src="./assets/favicon.svg" width="72" alt="Drift logo">
</p>

**Drift** is a real-time chat platform built with **pure HTML, CSS and JavaScript** — no frameworks, no build step. Rooms, live presence, an AI companion named **Zephyr**, community XP, polls, mini-games, smart notifications and a fully responsive UI.

> ✅ **Real backend included.** Accounts, messages and presence run on [Supabase](https://supabase.com) (Postgres + Auth + Realtime). No demo bots, no fake counters. Setup takes five minutes — see **[SETUP.md](./SETUP.md)**.

---

## ✨ Features

| Area | What you get |
|---|---|
| 🔐 **Auth** | Real Supabase Auth: sign-up with username/email/password, strength meter, login by username *or* email, password/email/username changes, server-side sessions |
| 💬 **Rooms** | Create / join / leave / delete, public + private (invite codes via RPC), 10 categories, tags, rules, slow mode, moderators, live room settings |
| 🧠 **Zephyr AI** | Real LLM responses via [AIML API](https://aimlapi.com) (OpenAI-compatible): summaries, icebreakers, explanations, rewrite, translate, code help, math — with persona settings and thread memory |
| 👥 **People** | Real profile directory from Postgres, follow system, live presence dots, profile cards with XP rings & earned badges, mute / block / report |
| 💬 **Messages** | Persisted in Postgres + realtime delivery, replies, mentions w/ autocomplete, emoji picker, custom reaction set, editing, deletion, pins + pin bar, read tracking, typing indicators, link previews, in-room search |
| 🗳️ **Polls** | One-tap poll builder; votes persist through an RPC (`cast_vote`) and update on every client live |
| 🎮 **Mini activities** | Reaction Race and Trivia Rush — results post into chat as real messages |
| 🏆 **Gamification** | Community XP stored on your profile, levels, daily streaks, daily quests, achievements grid |
| 📡 **Presence** | Genuine online counts everywhere — landing page, home dashboard, room header — powered by a Realtime Presence channel |
| 🔎 **Search** | Command palette (**Ctrl/⌘+K**) plus a full search page across rooms, people & your messages |
| 🔔 **Notifications** | DB-backed (SQL triggers fire on follows & room joins), streamed live; per-type preferences, toasts, unread badges |
| 🛡️ **Moderation** | Reports persisted to a `reports` table for the operator, local mutes/blocks, escalation flow |
| ⚙️ **Settings** | Dark/light themes, 5 accent gradients, font scale, reduced motion, high contrast, compact mode, privacy controls, AI persona, JSON data export |

---

## 🚀 Quick start

1. **Create the database** — free project at [supabase.com](https://supabase.com), then run [`supabase-setup.sql`](./supabase-setup.sql) in its SQL Editor.
2. **Wire your keys** — copy the project URL + anon key into `js/config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
3. Serve the folder:

```bash
python3 -m http.server 8080     # → http://localhost:8080
```

Until credentials are set, every page shows a friendly setup screen instead of a broken app. Full details in **[SETUP.md](./SETUP.md)**.

---

## 🌐 Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Source:** `Deploy from a branch` → `main` / `/ (root)`.
3. Live at `https://<user>.github.io/<repo>/`.

All asset paths are relative, so project sub-paths work fine.

---

## 🗂️ Project structure

```
drift/
├── index.html            Landing page
├── login.html            Login
├── signup.html           Registration
├── app.html              The application shell
├── supabase-setup.sql    ★ Run once in Supabase SQL Editor
├── SETUP.md              ★ Step-by-step backend setup
├── assets/
│   └── favicon.svg       Logo / favicon
├── css/
│   ├── tokens.css        Design system: themes, accents, motion prefs
│   ├── base.css          Reset, typography, aurora backdrop
│   ├── components.css    Buttons, cards, modals, toasts, menus…
│   ├── animations.css    Keyframes & entrance utilities
│   ├── landing.css       Hero, showcases, footer
│   ├── auth.css          Split-screen auth layout
│   ├── app.css           Shell + every app view (incl. chat)
│   └── responsive.css    Tablet/phone refinements
└── js/
    ├── config.js         ★ Deployment knobs (Supabase keys, AI key/model)
    ├── supabase-client.js Shared client + setup guard overlay
    ├── utils.js          DOM helpers, formatters, avatars, icon library
    ├── store.js          DB-backed state + pub/sub event bus
    ├── backend.js        Realtime subscriptions: messages, presence, typing
    ├── ui.js             Toasts, modals, menus, emoji picker, confetti
    ├── auth.js           Supabase Auth wrapper
    ├── ai.js             Zephyr: AIML/OpenAI-compatible engine + UI
    ├── notifications.js  Notification center + badges
    ├── rooms.js          Discovery, creation, membership, settings
    ├── chat.js           The room view engine (largest module)
    ├── activities.js     Reaction Race & Trivia Rush
    ├── people.js         People directory, follows, profile cards
    ├── finder.js         Command palette + search page
    ├── moderation.js     Reports, mutes, blocks
    ├── settings.js       All settings sections
    ├── landing.js        Hero animation & reveals
    └── app.js            Router, shell wiring, onboarding tour
```

### Architecture notes

- **One event bus.** Everything flows through `Store.on/emit` (`msg:new`, `presence`, `typing`, `xp`, …), so views never talk to the network directly.
- **Security is enforced by row-level security** in `supabase-setup.sql`, not by hiding keys — the anon key is public by design.
- **Honest failures.** If the AI backend errors (out of funds, bad model), Zephyr says so instead of falling back to canned replies.

---

## 🤖 Zephyr AI configuration

Works out of the box with [AIML API](https://aimlapi.com):

```js
// js/config.js
AI_ENABLED: true,
AI_BASE_URL: 'https://api.aimlapi.com/v1',
AI_MODEL: 'gpt-4o-mini',        // any model your plan supports
AI_API_KEY: '…',
```

⚠️ A key shipped to the browser is **public** — anyone can read it in DevTools and spend your credits. For production, move it into a Supabase Edge Function that forwards to your provider, then point `AI_PROXY_URL` at that function instead. The proxy contract is simple: `POST { messages:[{role,content}], persona } → { text }`.

---

## 🗺️ Future improvements

- Threads / side-conversations branching from any message
- Voice rooms & screen-share previews (WebRTC)
- End-to-end encryption for private rooms
- i18n + full translation pipeline for Zephyr
- PWA install support with offline caching
- Rich embeds (YouTube, Spotify, Figma) via oEmbed proxy
- Moderation ML auto-flagging through the same AI proxy

---

Built with vanilla web tech. Remix it, extend it, make it yours. ✦
