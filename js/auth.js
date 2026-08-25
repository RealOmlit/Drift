/* ==========================================================================
   Drift · auth.js
   ───────────────────────────────────────────────────────────────────────────
   ⚠️  DEMO AUTHENTICATION — runs entirely in the browser via localStorage.
   It is convenient for the GitHub Pages preview but it is NOT secure and
   must never guard real user data.

   PRODUCTION: replace this module's internals with Supabase Auth or
   Firebase Auth. Every public method below is marked `// [BACKEND]`
   with a suggested one-liner replacement, e.g.
     supabase.auth.signUp({ email, password })
     firebase.auth().createUserWithEmailAndPassword(email, password)
   The rest of the app only talks to these public methods, so swapping is easy.
   ========================================================================== */

window.Auth = (() => {
  'use strict';
  const SESSION_KEY = window.DriftConfig.STORAGE_PREFIX + 'session';

  const current = () => Store.state.session ? Store.me() : null;

  /* ---------------------- password hashing (demo-grade) ----------------------
     We hash so plaintext passwords never touch localStorage, but client-side
     hashing is NOT real security. Real backends handle this server-side. */
  async function hashPassword(pw) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('drift::' + pw));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // crypto.subtle unavailable (insecure context) → weak fallback, demo only
      let h = 0; for (const c of 'drift::' + pw) h = (h << 5) - h + c.charCodeAt(0) | 0;
      return 'fb_' + Math.abs(h).toString(16);
    }
  }

  /* ------------------------------ validation ------------------------------ */
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateUsername(u) {
    if (!USERNAME_RE.test(u)) return '3–20 chars, letters, numbers, underscores.';
    if (u.toLowerCase() === 'me' || u.toLowerCase() === 'zephyr') return 'That name is reserved.';
    if (Store.state.accounts[u.toLowerCase()] ||
        DemoData.users.some(b => b.username.toLowerCase() === u.toLowerCase())) return 'That username is taken.';
    return null;
  }
  function passwordStrength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(s, 4);
  }

  /* ------------------------------ sign up ------------------------------ */
  // [BACKEND] → await supabase.auth.signUp({ email, password }) then insert profile row.
  async function signUp({ username, email, password, displayName, avatarEmoji = '', hue = null }) {
    username = (username || '').trim();
    email = (email || '').trim().toLowerCase();
    const err = validateUsername(username);
    if (err) throw new Error(err);
    if (!EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.');
    if ((password || '').length < 8) throw new Error('Password needs at least 8 characters.');
    if (Object.values(Store.state.accounts).some(a => a.email === email)) throw new Error('An account with that email already exists.');

    const key = username.toLowerCase();
    Store.state.accounts[key] = {
      username, email,
      pwHash: await hashPassword(password),
      createdAt: Date.now()
    };
    startSession(key, true);

    Store.state.profile = {
      id: 'me',
      username,
      email,
      displayName: (displayName || username).trim(),
      bio: '',
      statusMsg: 'New here — say hi! 👋',
      status: 'online',
      avatarEmoji, hue: hue ?? U.hueOf(username),
      xp: 40,                       // small welcome grant
      joinedAt: Date.now(),
      following: [],                // friends I added
      followers: [],                // who added me back
      pendingSent: [],              // outbound friend requests {id}
      reads: {},                    // last-read timestamps per room
      stats: { msgs: 0, reactionsGiven: 0, pollsVoted: 0, gamesPlayed: 0 },
      badges: ['early'],
      quest: null,
      lastSeen: Date.now()
    };

    // First-run flavor: welcome notifications from the demo world
    Store.state.notifications = DemoData.seedNotifications();
    Store.touchStreak();
    Store.save();
    return Store.state.profile;
  }

  /* ------------------------------- log in ------------------------------- */
  // [BACKEND] → await supabase.auth.signInWithPassword({ email, password })
  async function signIn(identifier, password, remember = true) {
    identifier = (identifier || '').trim().toLowerCase();
    const acct = Store.state.accounts[identifier] ||
      Object.values(Store.state.accounts).find(a => a.email === identifier);
    if (!acct) throw new Error('No account found for that username or email.');
    if (acct.pwHash !== await hashPassword(password)) throw new Error('Incorrect password. Try again.');

    startSession(acct.username.toLowerCase(), remember);

    // Restore (or bootstrap) the profile bound to this account
    if (!Store.state.profile || Store.state.profile.username.toLowerCase() !== acct.username.toLowerCase()) {
      Store.state.profile = {
        id: 'me', username: acct.username, email: acct.email,
        displayName: acct.username, bio: '', statusMsg: 'Around and about',
        status: 'online', avatarEmoji: '', hue: U.hueOf(acct.username),
        xp: 120, joinedAt: acct.createdAt || Date.now(),
        following: [], followers: [], pendingSent: [], reads: {},
        stats: { msgs: 0, reactionsGiven: 0, pollsVoted: 0, gamesPlayed: 0 },
        badges: ['early'], quest: null, lastSeen: Date.now()
      };
      if (!Store.state.notifications.length) Store.state.notifications = DemoData.seedNotifications();
    } else {
      Store.state.profile.email = acct.email;
    }
    Store.state.profile.status = 'online';
    Store.state.profile.lastSeen = Date.now();
    Store.touchStreak();
    Store.save();
    return Store.state.profile;
  }

  /** One-click demo session for reviewers. */
  function signInDemo() {
    const key = 'nova';
    if (!Store.state.accounts[key]) {
      Store.state.accounts[key] = { username: 'Nova', email: 'demo@drift.chat', pwHash: 'demo', createdAt: Date.now() };
    }
    startSession(key, true);
    if (!Store.state.profile || Store.state.profile.username.toLowerCase() !== 'nova') {
      Store.state.profile = {
        id: 'me', username: 'Nova', email: 'demo@drift.chat',
        displayName: 'Demo Drifter', bio: 'Just drifting through the demo ✨',
        statusMsg: 'Exploring Drift', status: 'online', avatarEmoji: '🚀', hue: 262,
        xp: 340, joinedAt: Date.now() - 6 * 864e5,
        following: ['u1', 'u8'], followers: ['u8', 'u13'], pendingSent: [], reads: {},
        stats: { msgs: 12, reactionsGiven: 21, pollsVoted: 4, gamesPlayed: 1 },
        badges: ['early', 'starter'], quest: null, lastSeen: Date.now()
      };
    }
    if (!Store.state.notifications.length) Store.state.notifications = DemoData.seedNotifications();
    Store.state.profile.status = 'online';
    Store.touchStreak();
    Store.save();
    location.href = './app.html';
  }

  function startSession(usernameKey, remember) {
    Store.state.session = { username: usernameKey };
    const payload = JSON.stringify(Store.state.session);
    try {
      if (remember) localStorage.setItem(SESSION_KEY, payload);
      else sessionStorage.setItem(SESSION_KEY, payload);
    } catch (e) {}
  }

  /** Restore session on page load (checks both storages). */
  function restore() {
    Store.init();   // idempotent — guarantees accounts are loaded no matter the call order
    let raw = null;
    try {
      raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    } catch (e) {}
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      if (s && s.username && Store.state.accounts[s.username]) {
        Store.state.session = s;
        if (!Store.state.profile || Store.state.profile.username.toLowerCase() !== s.username) {
          // profile missing (cleared storage) → rebuild minimal shell account
          const acct = Store.state.accounts[s.username];
          Store.state.profile = {
            id: 'me', username: acct.username, email: acct.email,
            displayName: acct.username, bio: '', statusMsg: 'Back online',
            status: 'online', avatarEmoji: '', hue: U.hueOf(acct.username),
            xp: 60, joinedAt: acct.createdAt || Date.now(),
            following: [], followers: [], pendingSent: [], reads: {},
            stats: { msgs: 0, reactionsGiven: 0, pollsVoted: 0, gamesPlayed: 0 },
            badges: ['early'], quest: null, lastSeen: Date.now()
          };
          Store.save();
        }
        return true;
      }
    } catch (e) {}
    return false;
  }

  /* ------------------------------- log out ------------------------------ */
  // [BACKEND] → await supabase.auth.signOut()
  function signOut() {
    if (Store.state.profile) {
      Store.state.profile.lastSeen = Date.now();
    }
    // Clear in-memory session BEFORE any persistence — otherwise the
    // beforeunload flush below resurrects it into localStorage.
    Store.state.session = null;
    Store.save();
    try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    Backend.stop();
    location.href = './login.html?loggedOut=1';
  }

  /* --------------------------- account upkeep --------------------------- */
  async function changePassword(oldPw, newPw) {
    const key = Store.state.session?.username;
    const acct = key && Store.state.accounts[key];
    if (!acct) throw new Error('Not signed in.');
    if (acct.pwHash !== await hashPassword(oldPw)) throw new Error('Current password is incorrect.');
    if ((newPw || '').length < 8) throw new Error('New password needs at least 8 characters.');
    acct.pwHash = await hashPassword(newPw);
    Store.save();
  }

  function changeUsername(newName) {
    newName = (newName || '').trim();
    if (!USERNAME_RE.test(newName)) throw new Error('Usernames are 3–20 letters/numbers/underscores.');
    const key = Store.state.session?.username;
    const oldKey = key;
    if (oldKey === newName.toLowerCase()) return;
    const err = validateUsername(newName);
    if (err) throw new Error(err);
    const acct = Store.state.accounts[oldKey];
    delete Store.state.accounts[oldKey];
    acct.username = newName;
    Store.state.accounts[newName.toLowerCase()] = acct;
    Store.state.session.username = newName.toLowerCase();
    Store.state.profile.username = newName;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(Store.state.session));
    } catch (e) {}
    Store.save();
  }

  /* ----------------------------- page guards ---------------------------- */
  function requireAuth() {
    if (!restore()) { location.replace('./login.html'); return false; }
    return true;
  }
  function redirectIfAuthed() {
    if (restore()) { location.replace('./app.html'); return true; }
    return false;
  }

  // Mark the user offline when leaving (real presence would do this server-side)
  window.addEventListener('beforeunload', () => {
    if (Store.state.profile) { Store.state.profile.lastSeen = Date.now(); Store.persistNow(); }
  });

  return {
    current, signUp, signIn, signInDemo, signOut, restore,
    requireAuth, redirectIfAuthed, changePassword, changeUsername,
    validateUsername, passwordStrength
  };
})();
