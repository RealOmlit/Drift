/* ==========================================================================
   Drift · store.js — REAL data layer backed by Supabase (Postgres + Realtime).

   · Accounts/sessions/messages/profiles live in the database (see
     supabase-setup.sql). localStorage now holds only UI preferences
     (theme, sounds, muted/blocked users, recent emoji).
   · The pub/sub event bus is unchanged: 'msg:new', 'msg:update',
     'presence', 'xp', 'levelup', 'quest', 'notif:new', 'room:update', …
     so view modules keep working without knowing about the network.
   ========================================================================== */

window.Store = (() => {
  'use strict';
  const CFG = window.DriftConfig;
  const KEY = k => CFG.STORAGE_PREFIX + k;

  /** Level thresholds for Community XP. */
  const LEVELS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000];

  const state = {
    profile: null,           // mapped profile of the signed-in user
    rooms: [],               // hydrated rooms (joined + discover cache)
    notifications: [],
    reports: [],
    settings: defaultSettings(),
    meta: {
      onlineCount: 0,        // REAL presence count (filled by backend.js)
      mutedUsers: [], blockedUsers: [],
      recentEmoji: [],
      zephyrThread: []       // AI chat history (only used when AI_ENABLED)
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
      aiPersona: 'friendly',
      aiContext: true,
      sounds: false,
      notifs: { mention: true, message: false, friend: true, invite: true, room_activity: true, achievement: true, ai: false, system: true }
    };
  }

  /* ------------------------- local prefs persistence ------------------------- */
  let saveTimer = null;
  const PREF_KEYS = ['settings', 'meta'];

  function persistNow() {
    try {
      PREF_KEYS.forEach(k => localStorage.setItem(KEY(k), JSON.stringify(state[k])));
    } catch (e) { console.warn('[Drift] storage unavailable', e); }
    if (profileDirty && state.profile) {
      clearTimeout(profileTimer);
      pushProfile();
    }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { PREF_KEYS.forEach(k => localStorage.setItem(KEY(k), JSON.stringify(state[k]))); } catch (e) {}
      if (profileDirty && state.profile) pushProfile();
    }, 400);
  }
  function loadPrefs() {
    PREF_KEYS.forEach(k => {
      try {
        const raw = localStorage.getItem(KEY(k));
        if (raw != null) state[k] = JSON.parse(raw);
      } catch (e) {}
    });
    state.settings = Object.assign(defaultSettings(), state.settings || {});
    state.settings.notifs = Object.assign(defaultSettings().notifs, state.settings.notifs || {});
    state.meta = Object.assign({ onlineCount: 0, mutedUsers: [], blockedUsers: [], recentEmoji: [], zephyrThread: [] }, state.meta || {});
  }
  function resetAll() { PREF_KEYS.forEach(k => localStorage.removeItem(KEY(k))); }
  let booted = false;
  function init() {
    if (booted) return;
    loadPrefs();
    booted = true;
    window.addEventListener('beforeunload', () => {
      if (state.profile) touchPresence(false);
      persistNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistNow();
    });
  }

  /* ------------------------------ pub/sub bus ------------------------------ */
  const listeners = {};
  function on(evt, fn)   { (listeners[evt] = listeners[evt] || []).push(fn); return () => off(evt, fn); }
  function off(evt, fn)  { if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  /* --------------------------- profile <-> DB row --------------------------- */
  const profileCache = new Map();          // uuid → mapped profile (other users)

  function rowToProfile(row, email) {
    const m = row.meta || {};
    return {
      id: row.id,
      username: row.username,
      email: email || '',
      displayName: row.display_name || row.username,
      bio: row.bio || '',
      statusMsg: row.status_msg || '',
      avatarEmoji: row.avatar_emoji || '',
      hue: row.hue ?? U.hueOf(row.username),
      xp: row.xp || 0,
      reads: row.reads || {},
      joinedAt: Date.parse(row.created_at) || Date.now(),
      lastSeen: row.last_seen ? Date.parse(row.last_seen) : null,
      following: m.following || [],
      followers: m.followers || [],
      stats: Object.assign({ msgs: 0, reactionsGiven: 0, pollsVoted: 0, gamesPlayed: 0 }, m.stats),
      badges: m.badges || ['early'],
      quest: m.quest || null,
      onboarded: !!m.onboarded,
      recentEmoji: m.recentEmoji || []
    };
  }

  function profilePatch(p) {
    return {
      display_name: p.displayName,
      bio: p.bio,
      status_msg: p.statusMsg,
      avatar_emoji: p.avatarEmoji,
      hue: p.hue,
      xp: p.xp,
      reads: p.reads || {},
      meta: {
        following: p.following, followers: p.followers,
        stats: p.stats, badges: p.badges, quest: p.quest,
        onboarded: !!p.onboarded, recentEmoji: p.recentEmoji || []
      }
    };
  }

  let profileDirty = false;
  let profileTimer = null;
  function pushProfile() {
    profileDirty = false;
    const p = state.profile;
    if (!p) return;
    SB.unwrap(SB.client.from('profiles').update(profilePatch(p)).eq('id', p.id))
      .catch(e => console.warn('[Drift] profile sync failed', e.message));
  }
  function touchProfile() { profileDirty = true; save(); }

  /** Create/refresh the signed-in user's mapped profile from an auth user. */
  async function ensureProfile(user) {
    let rows = await SB.unwrap(
      SB.client.from('profiles').select('*').eq('id', user.id).limit(1)
    );
    if (!rows.length) {
      // Trigger missing or raced — create the row ourselves.
      const md = user.user_metadata || {};
      rows = await SB.unwrap(
        SB.client.from('profiles').insert({
          id: user.id,
          username: md.username || ('user_' + user.id.slice(0, 8)),
          display_name: md.display_name || md.username || 'drifter',
          avatar_emoji: md.avatar_emoji || '',
          hue: md.hue ?? U.hueOf(md.username || 'drifter')
        }).select('*')
      );
    }
    state.profile = rowToProfile(rows[0], user.email);
    profileCache.set(state.profile.id, state.profile);
    return state.profile;
  }

  /** Post-login hydration: social graph + inbox + rooms + messages. */
  async function afterLogin() {
    const me = state.profile;

    // Social graph
    const [f1, f2] = await Promise.all([
      SB.unwrap(SB.client.from('follows').select('followed').eq('follower', me.id)),
      SB.unwrap(SB.client.from('follows').select('follower').eq('followed', me.id))
    ]);
    me.following = f1.map(r => r.followed);
    me.followers = f2.map(r => r.follower);

    // Inbox (most recent 60)
    const inbox = await SB.unwrap(
      SB.client.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)
    );
    state.notifications = inbox.map(mapNotification);

    // Reports I filed
    state.reports = await SB.unwrap(
      SB.client.from('reports').select('*').order('created_at', { ascending: false }).limit(40)
    ).then(rs => rs.map(mapReport)).catch(() => []);

    await refreshRooms();
    touchPresence(true);
    emit('store:ready');
  }

  function forgetSession() {
    state.profile = null;
    state.rooms = [];
    state.notifications = [];
    state.reports = [];
    profileCache.clear();
  }

  /* ------------------------------- accessors ------------------------------- */
  const me = () => state.profile;
  const getRoom = id => state.rooms.find(r => r.id === id);
  const roomMessages = roomId => { const r = getRoom(roomId); return r ? r.messages : []; };

  /** Resolve any user synchronously from cache; fetches on miss. */
  function getUser(id) {
    if (id === 'me') return state.profile;
    if (!id) return null;
    if (profileCache.has(id)) return profileCache.get(id);
    // Placeholder while the real row is in flight.
    const stub = { id, username: '…', displayName: '…', bio: '', statusMsg: '', status: 'offline', avatarEmoji: '', hue: U.hueOf(id), xp: 0, badges: [] };
    profileCache.set(id, stub);
    SB.unwrap(SB.client.from('profiles').select('*').eq('id', id).limit(1))
      .then(rows => {
        if (rows.length) {
          const p = rowToProfile(rows[0]);
          profileCache.set(id, p);
          emit('profile:loaded', p);
        }
      })
      .catch(() => {});
    return stub;
  }

  /** All known profiles (people directory / search). Fetches once per session. */
  let directoryPromise = null;
  function allProfiles() {
    if (!directoryPromise) {
      directoryPromise = SB.unwrap(
        SB.client.from('profiles').select('*').neq('id', state.profile?.id || '').order('created_at', { ascending: true }).limit(500)
      ).then(rows => {
        rows.forEach(r => {
          const p = rowToProfile(r);
          if (p.id !== state.profile?.id) profileCache.set(p.id, p);
        });
        return [...profileCache.values()].filter(p => p.id !== state.profile?.id);
      }).catch(e => { directoryPromise = null; throw e; });
    }
    return directoryPromise;
  }

  /* -------------------------------- rooms -------------------------------- */
  const roomRowToRoom = (r, members) => ({
    id: r.id,
    name: r.name,
    desc: r.description || '',
    icon: r.icon || '💬',
    category: r.category || 'general',
    visibility: r.visibility || 'public',
    ownerId: r.owner_id,
    mods: r.mods || [],
    privateCode: r.invite_code || null,       // only present when RLS exposes it
    slowMode: r.slow_mode || 0,
    tags: r.tags || [],
    rules: r.rules || [],
    members: ['me', ...(members || []).map(m => m.user_id)],
    memberCount: (members ? members.length : 0) || 1,
    momentum: 0,                              // legacy field — no longer fake-scored
    createdAt: Date.parse(r.created_at) || Date.now(),
    messages: []
  });

  const msgRowToMsg = m => ({
    id: m.id,
    roomId: m.room_id,
    userId: m.user_id || 'sys',
    text: m.content || '',
    ts: Date.parse(m.created_at),
    edited: m.edited || false,
    deleted: m.deleted || false,
    pinned: m.pinned || false,
    type: m.type || 'text',
    replyTo: m.reply_to || null,
    poll: m.poll || null,
    meta: m.meta || null,
    reactions: {},
    seen: false
  });

  function mapNotification(n) {
    return {
      id: n.id, type: n.type || 'system',
      title: n.title, body: n.body || '',
      actorId: n.actor_id || null, roomId: n.room_id || null,
      ts: Date.parse(n.created_at) || Date.now(), read: !!n.read
    };
  }
  function mapReport(r) {
    return {
      id: r.id, kind: r.kind, messageId: r.message_id, roomId: r.room_id,
      userId: r.target_user, reason: r.reason, status: r.status,
      ts: Date.parse(r.created_at) || Date.now()
    };
  }

  /** Load joined rooms (+messages) and a slice of public rooms for Discover. */
  async function refreshRooms() {
    const myMemberships = await SB.unwrap(
      SB.client.from('room_members').select('room_id').eq('user_id', state.profile.id)
    );
    const ids = myMemberships.map(m => m.room_id);

    let joinedRooms = [];
    if (ids.length) {
      joinedRooms = await SB.unwrap(
        SB.client.from('rooms').select('*').in('id', ids)
      );
    }
    const publicRooms = await SB.unwrap(
      SB.client.from('rooms').select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(30)
    );

    const all = [...joinedRooms];
    const seen = new Set(ids);
    publicRooms.forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); all.push(r); } });

    // Memberships for these rooms (RLS permits public rooms + own rooms)
    let memberRows = [];
    if (all.length) {
      memberRows = await SB.unwrap(
        SB.client.from('room_members').select('room_id,user_id')
          .in('room_id', all.map(r => r.id)).limit(5000)
      ).catch(() => []);
    }

    const byId = new Map();
    state.rooms = all.map(r => {
      const room = roomRowToRoom(r, memberRows.filter(m => m.room_id === r.id));
      byId.set(room.id, room);
      return room;
    });

    // Hydrate messages only for rooms I'm in
    await Promise.all(ids.filter(id => byId.has(id)).map(id => hydrateMessages(byId.get(id))));
    return state.rooms;
  }

  async function hydrateMessages(room) {
    const msgs = await SB.unwrap(
      SB.client.from('messages').select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(CFG.MESSAGE_WINDOW)
    );
    room.messages = msgs.reverse().map(msgRowToMsg);
    if (room.messages.length) {
      const rx = await SB.unwrap(
        SB.client.from('reactions').select('message_id,emoji,user_id')
          .in('message_id', room.messages.map(m => m.id)).limit(5000)
      ).catch(() => []);
      rx.forEach(({ message_id, emoji, user_id }) => {
        const m = room.messages.find(x => x.id === message_id);
        if (!m) return;
        (m.reactions[emoji] = m.reactions[emoji] || []).push(user_id);
      });
    }
    return room;
  }

  /* ------------------------- message mutation API -------------------------- */
  async function composeMessage(roomId, userId, text, extra = {}) {
    const room = getRoom(roomId);
    if (!room) return null;
    const payload = {
      room_id: roomId,
      user_id: userId === 'sys' ? null : state.profile.id,
      content: String(text || ''),
      type: extra.type || 'text'
    };
    if (extra.replyTo) payload.reply_to = extra.replyTo;
    if (extra.poll) payload.poll = extra.poll;
    if (extra.meta) payload.meta = extra.meta;

    const rows = await SB.unwrap(
      SB.client.from('messages').insert(payload).select('*')
    );
    const msg = msgRowToMsg(rows[0]);
    room.messages.push(msg);
    trimRoom(room);
    emit('msg:new', msg);
    return msg;
  }

  async function updateMessage(roomId, msgId, patch) {
    const room = getRoom(roomId);
    const m = room && room.messages.find(x => x.id === msgId);
    if (!m) return null;
    const dbPatch = {};
    if ('deleted' in patch) dbPatch.deleted = patch.deleted;
    if ('pinned' in patch) dbPatch.pinned = patch.pinned;
    if ('text' in patch) { dbPatch.content = patch.text; dbPatch.edited = true; }
    if (Object.keys(dbPatch).length) {
      const rows = await SB.unwrap(
        SB.client.from('messages').update(dbPatch).eq('id', msgId).select('*')
      );
      Object.assign(m, msgRowToMsg(rows[0]), { reactions: m.reactions });
    }
    emit('msg:update', m);
    return m;
  }

  async function toggleReaction(roomId, msgId, emoji, userId) {
    const m = roomMessages(roomId).find(x => x.id === msgId);
    if (!m) return;
    m.reactions[emoji] = m.reactions[emoji] || [];
    const i = m.reactions[emoji].indexOf(userId);
    let added;
    if (i >= 0) {
      m.reactions[emoji].splice(i, 1);
      added = false;
      await SB.unwrap(
        SB.client.from('reactions').delete()
          .match({ message_id: msgId, emoji, user_id: state.profile.id })
      );
    } else {
      m.reactions[emoji].push(userId);
      added = true;
      await SB.unwrap(
        SB.client.from('reactions').upsert(
          { message_id: msgId, emoji, user_id: state.profile.id },
          { onConflict: 'message_id,emoji,user_id' }
        )
      );
    }
    if (!m.reactions[emoji].length) delete m.reactions[emoji];
    emit('msg:update', m);
    return added;
  }

  function trimRoom(room, max = CFG.MESSAGE_WINDOW * 2) {
    if (room.messages.length > max) room.messages.splice(0, room.messages.length - max);
  }

  /* ---------------------- membership / social actions ---------------------- */
  async function joinRoomDb(roomId) {
    await SB.unwrap(SB.client.from('room_members').insert({ room_id: roomId, user_id: state.profile.id }));
  }
  async function leaveRoomDb(roomId) {
    await SB.unwrap(SB.client.from('room_members').delete().match({ room_id: roomId, user_id: state.profile.id }));
  }
  async function setFollow(targetId, on) {
    if (on) {
      await SB.unwrap(SB.client.from('follows').insert({ follower: state.profile.id, followed: targetId }));
    } else {
      await SB.unwrap(SB.client.from('follows').delete().match({ follower: state.profile.id, followed: targetId }));
    }
  }
  async function fileReport(rep) {
    const rows = await SB.unwrap(
      SB.client.from('reports').insert({
        reporter_id: state.profile.id,
        kind: rep.kind || 'message',
        message_id: rep.messageId || null,
        room_id: rep.roomId || null,
        target_user: rep.userId || null,
        reason: rep.reason || ''
      }).select('*')
    );
    state.reports.unshift(mapReport(rows[0]));
    emit('reports:update');
  }
  async function markNotification(id, read) {
    const n = state.notifications.find(x => x.id === id);
    if (n) n.read = read;
    await SB.unwrap(SB.client.from('notifications').update({ read }).eq('id', id));
    emit('notif:read');
  }

  /* ------------------------------ XP & levels ------------------------------ */
  function lvlInfo(xp) {
    let level = 1;
    for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i + 1;
    const floorLvl = LEVELS[level - 1];
    const nextLvl = LEVELS[level] ?? floorLvl + 3000;
    return { level, cur: xp, floorLvl, nextLvl, pct: Math.min(100, Math.round(((xp - floorLvl) / (nextLvl - floorLvl)) * 100)) };
  }

  function addXP(amount, reason) {
    const p = state.profile;
    if (!p || amount <= 0) return;
    const before = lvlInfo(p.xp).level;
    p.xp += amount;
    const info = lvlInfo(p.xp);
    touchProfile();
    emit('xp', { amount, reason, total: p.xp, info });
    if (info.level > before) emit('levelup', info);
  }

  /* ------------------------ daily quest & streak --------------------------- */
  const QUEST_POOL = [
    { type: 'send',  goal: 3, label: 'Send 3 messages',        reward: 60 },
    { type: 'react', goal: 3, label: 'React to 3 messages',    reward: 60 },
    { type: 'vote',  goal: 2, label: 'Vote in 2 polls',        reward: 70 },
    { type: 'pulse', goal: 1, label: 'Launch 1 mini activity', reward: 80 }
  ];
  const todayKey = () => new Date().toISOString().slice(0, 10);

  function questToday() {
    const p = state.profile;
    if (!p) return null;
    if (!p.quest || p.quest.day !== todayKey()) {
      const q = QUEST_POOL[Math.abs(U.hashCode(todayKey())) % QUEST_POOL.length];
      p.quest = { day: todayKey(), type: q.type, goal: q.goal, label: q.label, reward: q.reward, progress: 0, claimed: false };
      touchProfile();
    }
    return p.quest;
  }

  function questProgress(type, n = 1) {
    const q = questToday();
    if (!q || q.type !== type || q.claimed) return;
    q.progress = Math.min(q.goal, q.progress + n);
    touchProfile();
    emit('quest', q);
  }

  function touchStreak() {
    const s = state.profile;
    if (!s) return;
    s.streak = s.streak || { count: 0, lastDay: '' };
    if (s.streak.lastDay === todayKey()) return;
    const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    s.streak.count = s.streak.lastDay === yest ? s.streak.count + 1 : 1;
    s.streak.lastDay = todayKey();
    touchProfile();
  }

  /** Best-effort last_seen heartbeat. */
  function touchPresence(fireAndForget = true) {
    const p = state.profile;
    if (!p) return;
    const q = SB.client.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', p.id);
    if (fireAndForget) q.then(() => {}, () => {});
  }

  return {
    state, init, save, persistNow, resetAll, on, off, emit,
    me, getUser, getRoom, roomMessages, allProfiles,
    composeMessage, updateMessage, toggleReaction,
    ensureProfile, afterLogin, forgetSession, refreshRooms, hydrateMessages,
    joinRoomDb, leaveRoomDb, setFollow, fileReport, markNotification,
    addXP, lvlInfo, LEVELS,
    questToday, questProgress, touchStreak, touchProfile
  };
})();
