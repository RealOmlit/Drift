/* ==========================================================================
   Drift · store.js — single source of truth + tiny pub/sub event bus.
   Persists to localStorage under DriftConfig.STORAGE_PREFIX.
   In production this module is replaced/wrapped by js/backend.js adapters
   (Supabase / Firebase) — see README → "Connect Supabase or Firebase".
   ========================================================================== */

window.Store = (() => {
  'use strict';
  const CFG = window.DriftConfig;
  const KEY = k => CFG.STORAGE_PREFIX + k;

  /** Level thresholds for Community XP. */
  const LEVELS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000];

  const state = {
    accounts: {},            // demo credential store (DEMO ONLY — not secure)
    session: null,           // { username } of logged-in account
    profile: null,           // current user profile (id: 'me')
    rooms: [],               // materialized rooms incl. messages
    notifications: [],
    reports: [],
    settings: defaultSettings(),
    meta: {
      onlineCount: CFG.PRESENCE_BASELINE,
      mutedUsers: [], blockedUsers: [],
      zephyrThread: [], recentEmoji: [],
      onboarded: false,
      streak: { count: 0, lastDay: '' }
    }
  };

  function defaultSettings() {
    return {
      theme: 'dark', accent: 'violet', font: 'm', motion: 'full', contrast: 'normal',
      compactMode: false,
      enterToSend: true,
      showTimestamps24h: false,
      linkPreviews: true,
      readReceipts: true,
      privacyLastSeen: true,
      aiPersona: 'friendly',     // friendly | concise | playful
      aiContext: true,
      sounds: false,
      notifs: { mention: true, message: false, friend: true, invite: true, room_activity: true, achievement: true, ai: false, system: true }
    };
  }

  /* ------------------------- persistence ------------------------- */
  let saveTimer = null;
  const PERSIST_KEYS = ['accounts', 'session', 'profile', 'rooms', 'notifications', 'reports', 'settings', 'meta'];

  function persistNow() {
    try {
      PERSIST_KEYS.forEach(k => localStorage.setItem(KEY(k), JSON.stringify(state[k])));
    } catch (e) { console.warn('[Drift] storage unavailable', e); }
  }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 250); }

  function load() {
    let found = false;
    PERSIST_KEYS.forEach(k => {
      try {
        const raw = localStorage.getItem(KEY(k));
        if (raw != null) { state[k] = JSON.parse(raw); found = true; }
      } catch (e) { /* corrupted → ignore */ }
    });
    // Merge new default settings keys after upgrades
    state.settings = Object.assign(defaultSettings(), state.settings || {});
    state.settings.notifs = Object.assign(defaultSettings().notifs, state.settings.notifs || {});
    state.meta = Object.assign({ onlineCount: CFG.PRESENCE_BASELINE, mutedUsers: [], blockedUsers: [], zephyrThread: [], recentEmoji: [], onboarded: false, streak: { count: 0, lastDay: '' } }, state.meta || {});
    return found;
  }

  function resetAll() {
    PERSIST_KEYS.forEach(k => localStorage.removeItem(KEY(k)));
    localStorage.removeItem(KEY('session'));
  }

  /* ------------------------- pub/sub bus ------------------------- */
  const listeners = {};
  function on(evt, fn)   { (listeners[evt] = listeners[evt] || []).push(fn); return () => off(evt, fn); }
  function off(evt, fn)  { if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  /* ------------------------- accessors ------------------------- */
  const me = () => state.profile;
  const getUser = id => id === 'me' ? state.profile
    : (window.DemoData ? window.DemoData.users.find(u => u.id === id) : null);
  const getRoom = id => state.rooms.find(r => r.id === id);

  function roomMessages(roomId) {
    const r = getRoom(roomId);
    return r ? r.messages : [];
  }

  /**
   * Central message factory — used by the composer AND by the demo realtime
   * simulation so every message flows through one path ('msg:new' event).
   */
  function composeMessage(roomId, userId, text, extra = {}) {
    const room = getRoom(roomId);
    if (!room) return null;
    const msg = Object.assign({
      id: U.uid('m'), roomId, userId, text: String(text || ''), ts: Date.now(),
      edited: false, deleted: false, pinned: false,
      reactions: {}, replyTo: null, type: 'text',
      seen: false, poll: null, meta: null
    }, extra);
    room.messages.push(msg);
    trimRoom(room);
    save();
    emit('msg:new', msg);
    return msg;
  }

  function updateMessage(roomId, msgId, patch) {
    const m = roomMessages(roomId).find(x => x.id === msgId);
    if (!m) return null;
    Object.assign(m, patch);
    save();
    emit('msg:update', m);
    return m;
  }

  function toggleReaction(roomId, msgId, emoji, userId) {
    const m = roomMessages(roomId).find(x => x.id === msgId);
    if (!m) return;
    m.reactions[emoji] = m.reactions[emoji] || [];
    const i = m.reactions[emoji].indexOf(userId);
    if (i >= 0) m.reactions[emoji].splice(i, 1);
    else m.reactions[emoji].push(userId);
    if (!m.reactions[emoji].length) delete m.reactions[emoji];
    save();
    emit('msg:update', m);
    return i < 0; // true → reaction added
  }

  function trimRoom(room, max = 260) {
    if (room.messages.length > max) room.messages.splice(0, room.messages.length - max);
  }

  /* ------------------------- XP & levels ------------------------- */
  function lvlInfo(xp) {
    let level = 1;
    for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i + 1;
    const floorLvl = LEVELS[level - 1];
    const nextLvl = LEVELS[level] ?? floorLvl + 3000;
    return { level, cur: xp, floorLvl, nextLvl, pct: Math.min(100, Math.round(((xp - floorLvl) / (nextLvl - floorLvl)) * 100)) };
  }

  /** Award XP; emits 'xp' and 'levelup'. UI decides how to celebrate. */
  function addXP(amount, reason) {
    const p = state.profile;
    if (!p || amount <= 0) return;
    const before = lvlInfo(p.xp).level;
    p.xp += amount;
    const info = lvlInfo(p.xp);
    save();
    emit('xp', { amount, reason, total: p.xp, info });
    if (info.level > before) emit('levelup', info);
  }

  /* ------------------------- daily quest & streak ------------------------- */
  const QUEST_POOL = [
    { type: 'send',  goal: 3, label: 'Send 3 messages',           reward: 60 },
    { type: 'react', goal: 3, label: 'React to 3 messages',       reward: 60 },
    { type: 'vote',  goal: 2, label: 'Vote in 2 polls',           reward: 70 },
    { type: 'pulse', goal: 1, label: 'Launch 1 mini activity',    reward: 80 }
  ];
  const todayKey = () => new Date().toISOString().slice(0, 10);

  function questToday() {
    const p = state.profile;
    if (!p) return null;
    if (!p.quest || p.quest.day !== todayKey()) {
      const q = QUEST_POOL[U.hashCode(todayKey()) % QUEST_POOL.length];
      p.quest = { day: todayKey(), type: q.type, goal: q.goal, label: q.label, reward: q.reward, progress: 0, claimed: false };
      save();
    }
    return p.quest;
  }

  function questProgress(type, n = 1) {
    const q = questToday();
    if (!q || q.type !== type || q.claimed) return;
    q.progress = Math.min(q.goal, q.progress + n);
    save();
    emit('quest', q);
  }

  function touchStreak() {
    const s = state.meta.streak;
    const today = todayKey();
    if (s.lastDay === today) return;
    const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    s.count = s.lastDay === yest ? s.count + 1 : 1;
    s.lastDay = today;
    save();
  }

  /* ------------------------- boot ------------------------- */
  let booted = false;
  function init() {
    if (booted) return;          // idempotent — never clobber live state
    load();
    booted = true;
    if (!state.rooms || !state.rooms.length) {
      // First run: build the demo world (users, rooms, seeded conversations).
      const world = window.DemoData.buildWorld(state);
      state.rooms = world.rooms;
      persistNow();
    }
    // Ensure demo bots exist in memory even when storage was pre-seeded.
    window.DemoData.ensureUsers();
    // Flush any pending debounced writes when the page goes away.
    window.addEventListener('beforeunload', persistNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistNow(); });
  }

  return {
    state, init, save, persistNow, resetAll, on, off, emit,
    me, getUser, getRoom, roomMessages,
    composeMessage, updateMessage, toggleReaction,
    addXP, lvlInfo, LEVELS,
    questToday, questProgress, touchStreak
  };
})();
