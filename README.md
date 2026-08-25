# Drift ✦ Conversations in motion

<p align="center">
  <img src="./assets/favicon.svg" width="72" alt="Drift logo">
</p>

**Drift** is a premium, modern chat platform concept built with **pure HTML, CSS and JavaScript** — no frameworks, no build step. It looks and feels like a startup-quality social product: rooms with a visible *momentum* score, an AI companion named **Zephyr** woven into every conversation, community XP, polls, mini-games, smart notifications and a fully responsive UI.

> ⚠️ **This is a frontend demo.** Authentication, messages and presence run locally in your browser so the project works on GitHub Pages out of the box. The architecture is deliberately structured so a real backend (Supabase / Firebase) can be connected later — every integration point is marked in code.

---

## ✨ Feature highlights

| Area | What you get |
|---|---|
| 🔐 **Auth** | Sign-up, login (username or email), password visibility toggle + strength meter, remember me, logout, profile editing, username/email/password changes, last-seen & availability |
| 💬 **Rooms** | Create / join / leave / delete rooms, public + private (invite codes), 10 categories, tags, rules, slow mode, moderators, room settings, live momentum meter |
| 🧠 **Zephyr AI** | Built-in assistant with its own identity: room summaries, icebreakers, message explanations, rewrite, translate (demo), code help, moderation coaching, math. `✨ Ask AI` lives right in the composer |
| 👥 **People** | Live-feeling online counts (~1,284 baseline), online/recent/offline filters, friend requests, animated profile cards with XP rings & badges, mute / block / report |
| 💬 **Messages** | Replies, mentions w/ autocomplete, emoji picker, Drift's own reaction set (🤯 💡 🤝 W…), editing, deletion, pins + pin bar, copy, read receipts, typing indicators, link previews, in-room search, markdown-ish formatting incl. code blocks |
| 🗳️ **Polls** | One-tap poll builder inside any room; votes arrive live and bars animate |
| 🎮 **Mini activities** | Reaction Race (reflex duel) and Trivia Rush — results post into the chat |
| 🏆 **Gamification** | Community XP, levels, daily streaks, daily quests, achievements grid |
| ⚡ **Quick Pulse** | Trending topics ticker across all rooms |
| 🔥 **Trending** | Momentum-ranked room discovery (trending / newest / biggest) |
| 🔎 **Search** | Global command palette (**Ctrl/⌘+K**) plus a full search page across rooms, people, messages & topics |
| 🔔 **Notifications** | Notification center, per-type preferences, elegant toasts, unread badges |
| 🛡️ **Moderation** | Report messages/users, mutes, blocks, escalation flow, moderation dashboard |
| ⚙️ **Settings** | Dark/light themes, 5 accent gradients, font scale, reduced motion, high contrast, compact mode, privacy controls, AI persona, data export |

---

## 🚀 Run it locally

No dependencies, no build step:

```bash
# option A — just open it
open index.html            # macOS
xdg-open index.html        # Linux

# option B — tiny server (nicer URLs)
python3 -m http.server 8080
# → http://localhost:8080
```

Then click **“Try instant demo”** on the login page for a pre-filled session, or create your own account (stored only in your browser).

---

## 🌐 Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Source:** `Deploy from a branch`.
3. Choose branch `main` and folder `/ (root)` → Save.
4. Your site is live at `https://<user>.github.io/<repo>/`.

All asset paths are relative, so it also works fine from a project sub-path.

---

## 🗂️ Project structure

```
drift/
├── index.html            Landing page
├── login.html            Login (+ instant demo)
├── signup.html           Registration
├── app.html              The application shell
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
    ├── config.js         ★ Deployment knobs (backend provider, AI proxy URL)
    ├── utils.js          DOM helpers, formatters, avatars, icon library
    ├── store.js          State + pub/sub bus + localStorage persistence
    ├── demo-data.js      ⚠️ Mock users/rooms/messages (isolated demo layer)
    ├── backend.js        ⚠️ Realtime SIMULATION + integration markers [BACKEND]
    ├── ui.js             Toasts, modals, menus, emoji picker, confetti
    ├── auth.js           Demo auth (clearly marked; swap for Supabase/Firebase)
    ├── ai.js             Zephyr engine + remote proxy layer
    ├── notifications.js  Notification center + badges
    ├── rooms.js          Discovery, creation, membership, settings
    ├── chat.js           The room view engine (largest module)
    ├── activities.js     Reaction Race & Trivia Rush
    ├── people.js         People directory, friends, profile cards
    ├── finder.js         Command palette + search page
    ├── moderation.js     Reports, mutes, blocks, mod dashboard
    ├── settings.js       All settings sections
    ├── landing.js        Hero animation & reveals
    └── app.js            Router, shell wiring, onboarding tour
```

### Architecture notes

- **One event bus.** Everything flows through `Store.on/emit` (`msg:new`, `presence`, `typing`, `xp`, …), so swapping local state for websockets doesn't touch UI code.
- **Demo layers are quarantined.** `demo-data.js` (mock content) and the simulation loops in `backend.js` are isolated and clearly marked. Delete them once real endpoints exist.
- **No secrets in the client. Ever.**

---

## 🔌 Connect Supabase or Firebase

Every function that must be replaced carries a `// [BACKEND]` marker.

| Capability | Demo implementation | Supabase | Firebase |
|---|---|---|---|
| Auth | `js/auth.js` (localStorage + SHA-256 demo hash) | `supabase.auth.signUp / signInWithPassword` | Firebase Auth SDK |
| Messages | `Store.composeMessage` → array push | insert into `messages`; subscribe via `postgres_changes` | Firestore `onSnapshot` |
| Presence | number wobble in `backend.js` | Realtime Presence channel | Realtime Database `onDisconnect()` |
| Typing | simulated emits | broadcast payload on a channel | RTDB ephemeral writes |
| Notifications | local `Notifs.push` | table inserts + Realtime subscription | FCM + Firestore |

Recommended Supabase schema sketch:

```sql
create table profiles (
  id uuid primary key references auth.users,
  username text unique, display_name text, bio text,
  status_msg text, avatar_emoji text, hue int, xp int default 0
);
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text, description text, icon text, category text,
  visibility text default 'public', invite_code text,
  owner_id uuid references profiles, created_at timestamptz default now()
);
create table room_members (
  room_id uuid references rooms, user_id uuid references profiles,
  role text default 'member', primary key (room_id, user_id)
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms, user_id uuid references profiles,
  text text, reply_to uuid, type text default 'text',
  reactions jsonb default '{}', pinned bool default false,
  created_at timestamptz default now()
);
create table notifications ( ... );
```

Wire-up steps (Supabase example):

1. `npm create vite@latest` is **not** required — simply add `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` to `app.html`.
2. In `config.js`: set `BACKEND_PROVIDER: 'supabase'`.
3. Implement `Auth.signIn/signUp/signOut` with supabase calls.
4. In `chat.js`, replace `Store.roomMessages(roomId)` reads with a cached channel subscription that feeds the same `'msg:new'` events — the UI needs zero changes.

---

## 🤖 Connecting an AI API securely

**Never put an OpenAI/Anthropic/etc. key in frontend JavaScript.** Anyone can read it.

Instead, deploy a one-file proxy (Cloudflare Worker, Vercel Edge, Netlify Function…) that holds the key server-side:

```js
// Cloudflare Worker sketch — api.zephyr
export default {
  async fetch(req, env) {
    const { messages, persona, context } = await req.json();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`, // secret, server-side only
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are Zephyr, the AI companion of the Drift chat platform. Persona: ${persona}. Room context JSON may be provided.` },
          ...(context ? [{ role: 'system', content: 'Recent room context: ' + JSON.stringify(context) }] : []),
          ...messages
        ]
      })
    });
    const data = await r.json();
    return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content ?? '' }),
      { headers: { 'content-type': 'application/json' } });
  }
};
```

Then in `js/config.js`:

```js
AI_PROXY_URL: 'https://your-worker.your-subdomain.workers.dev/'
```

The request contract is simple: `POST { messages:[{role,content}], persona, context? }` → `{ text }`. Until configured, Zephyr runs its offline keyword engine so the demo stays fully functional without credentials.

---

## 🧪 Demo vs production honesty

- The **“1,284 people online”** counter, ambient bot chatter, typing indicators and notification events are **simulated** (`js/backend.js`) so static hosting feels alive.
- Accounts are stored in `localStorage` under the `drift.v1.*` namespace with a demo-grade password hash. This is convenient, **not secure** — see the banner shown on the signup page.
- Settings → Account → **Reset demo world** wipes and reseeds everything.

## 🗺️ Future improvements

- Threads / side-conversations branching from any message
- Voice rooms & screen-share previews (WebRTC)
- End-to-end encryption for private rooms
- i18n + full translation pipeline for Zephyr
- PWA install support with offline caching
- Rich embeds (YouTube, Spotify, Figma) via oEmbed proxy
- Moderation ML auto-flagging through the same AI proxy

---

Built as a showcase of what vanilla web tech can do in 2026. Remix it, connect a backend, make it yours. ✦
