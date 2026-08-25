/* ==========================================================================
   Drift · backend.js — realtime layer
   ───────────────────────────────────────────────────────────────────────────
   ⚠️  DEMO REALTIME SIMULATION
   This file *simulates* a live server: ambient bot chatter, typing
   indicators, presence fluctuations, poll votes and notifications.
   Nothing here talks to a network. It exists so the UI can be built and
   evaluated exactly as it would behave against Supabase/Firebase.

   PRODUCTION INTEGRATION POINTS (see README):
     Backend.start()        → open real subscriptions (postgres_changes / onSnapshot)
     Backend.stop()         → tear down listeners
     Backend.sendTyping()   → broadcast typing events
     Backend.presence()     → replace simulated presence with auth presence channel
   Every function that must be replaced is marked with `// [BACKEND]`.
   ========================================================================== */

window.Backend = (() => {
  'use strict';
  const CFG = window.DriftConfig;
  const SIM = CFG.SIM;
  let timers = [];

  /* ------------------------- helpers ------------------------- */
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
  function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }

  /** Pick an ambient speaker for a room (bots only). */
  function pickSpeaker(room) {
    const bots = room.members.filter(id => id !== 'me');
    return bots.length ? U.rand(bots) : null;
  }

  /** Compose a believable line for the room's category. */
  function botLine(room) {
    const pool = window.DemoData.CHATTER[room.category] || [];
    return U.chance(0.18)
      ? U.rand(window.DemoData.GENERIC)
      : U.rand(pool.length ? pool : window.DemoData.GENERIC);
  }

  /* ------------------------- simulation loops ------------------------- */

  // [BACKEND] Presence: replace with a Supabase Realtime presence channel /
  // Firebase onDisconnect()+presence ref. Here we simply wobble a number.
  function startPresence() {
    every(() => {
      const m = Store.state.meta;
      m.onlineCount = U.clamp(m.onlineCount + U.randInt(-7, 9), 1105, 1490);
      Store.emit('presence', m.onlineCount);
      // Occasionally flip a demo user's status so lists feel alive
      if (U.chance(0.35)) {
        const b = U.rand(window.DemoData.users);
        if (b.status !== 'offline') b.status = U.rand(['online', 'online', 'away']);
        else if (U.chance(0.25)) { b.status = 'online'; b.lastSeen = null; }
        Store.emit('presence', m.onlineCount);
      }
    }, SIM.presenceTickMs);
  }

  // [BACKEND] Messages & typing: replace with room-scoped subscriptions.
  function startAmbientChat() {
    every(() => {
      const view = window.Router && Router.current;
      // Prefer the room the user is looking at (feels most "live")
      const room = view && view.name === 'room'
        ? Store.getRoom(view.params[0])
        : Store.getRoom(U.rand(['r1', 'r2', 'r3', 'r7']));
      if (!room || !Store.me()) return;
      const speaker = pickSpeaker(room);
      if (!speaker || Mod.isMuted(speaker)) return;

      const name = DemoData.userById(speaker)?.username || 'someone';
      Store.emit('typing', { roomId: room.id, userId: speaker });

      later(() => {
        Store.emit('typing-stop', { roomId: room.id, userId: speaker });
        const msg = Store.composeMessage(room.id, speaker, botLine(room));
        if (msg && U.chance(0.4)) {
          // Bots react to each other sometimes
          later(() => {
            Store.toggleReaction(room.id, msg.id, U.rand(['🔥', '😂', '💡', '🤝', '❤️']), U.rand(room.members.filter(i => i !== speaker)));
          }, U.randInt(2500, 9000));
        }
        // Read receipts for the user's own recent messages (simulated)
        markOwnSeen(room.id);
      }, SIM.typingLeadMs + U.randInt(0, 1200));
    }, U.randInt(SIM.botMessageMinMs, SIM.botMessageMaxMs));
  }

  // Simulated "others read your message" ticks
  function markOwnSeen(roomId) {
    const mine = Store.roomMessages(roomId).filter(m => m.userId === 'me' && !m.seen);
    if (!mine.length || !Store.state.settings.readReceipts) return;
    const m = mine[0];
    Store.updateMessage(roomId, m.id, { seen: true });
  }

  // [BACKEND] Poll votes would arrive via message updates in production.
  function startPollVotes() {
    every(() => {
      Store.state.rooms.forEach(room => {
        room.messages.filter(m => m.type === 'poll').forEach(m => {
          if (U.chance(0.30)) {
            const voters = room.members.filter(id => id !== 'me');
            const v = U.rand(voters);
            if (v && !m.poll.options.some(o => o.votes.includes(v))) {
              U.rand(m.poll.options).votes.push(v);
              Store.save();
              Store.emit('msg:update', m);
            }
          }
        });
      });
    }, 21000);
  }

  // [BACKEND] Notifications: push via websockets / FCM in production.
  function startNotifications() {
    every(() => {
      if (!Store.me() || !U.chance(SIM.notifChance)) return;
      const kind = U.rand(['room_activity', 'friend', 'achievement']);
      if (kind === 'room_activity') {
        const room = U.rand(Store.state.rooms.filter(r => r.visibility !== 'private'));
        Notifs.push('room_activity', {
          title: `${room.name} is picking up steam`,
          body: `Momentum ${room.momentum} · ${U.randInt(3, 24)} new members today`,
          roomId: room.id
        });
      } else if (kind === 'friend') {
        const bot = U.rand(DemoData.users.filter(u => u.status !== 'offline'));
        People.acceptSimulatedRequest(bot);
      } else {
        const badges = [
          ['Conversation Starter', 'You\'ve been keeping rooms alive'],
          ['Reaction Giver', 'Your reactions spread good vibes'],
          ['Night Owl', 'Burning the midnight Drift oil']
        ];
        const [title, body] = U.rand(badges);
        Notifs.push('achievement', { title: `Badge unlocked: ${title}`, body });
      }
    }, 52000);
  }

  /**
   * Bot members gradually discover brand-new rooms and join them,
   * generating believable member growth + notifications for owners.
   */
  function startRoomGrowth() {
    every(() => {
      const mine = Store.state.rooms.filter(r => r.ownerId === 'me');
      if (!mine.length || !U.chance(0.5)) return;
      const room = U.rand(mine);
      const joiner = U.rand(DemoData.users);
      if (joiner && !room.members.includes(joiner.id)) {
        room.members.push(joiner.id);
        room.memberCount += 1;
        Store.save();
        Store.emit('room:update', room);
        Notifs.push('room_activity', {
          title: `${joiner.displayName} joined ${room.name}`,
          body: 'Your room keeps growing 🌱', roomId: room.id, actorId: joiner.id
        });
      }
    }, 47000);
  }

  /* ------------------------- public API ------------------------- */
  function start() {
    stop();
    startPresence();
    startAmbientChat();
    startPollVotes();
    startNotifications();
    startRoomGrowth();
  }
  function stop() { timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = []; }

  /** Composer calls this so other clients could show "X is typing". [BACKEND] */
  function sendTyping(roomId) { /* demo: no-op */ }

  return { start, stop, sendTyping };
})();
