/* ==========================================================================
   Drift · backend.js — REAL realtime layer on Supabase.

   · postgres_changes → live messages, reactions, rooms, notifications
   · a presence channel → genuine "drifters online" count + per-user status
   · broadcast        → typing indicators between real clients

   Public API (unchanged): start(), stop(), sendTyping(roomId),
   plus onlineUserIds() for presence-aware UI.
   ========================================================================== */

window.Backend = (() => {
  'use strict';
  let channel = null;
  let heartbeat = null;
  const online = new Map();          // userId → presence ref info

  function routeMessage(payload) {
    const row = payload.new;
    if (!row) return;
    const room = Store.getRoom(row.room_id);
    if (!room) return;                       // room not cached → not joined/public slice

    // Already landed through the HTTP path (optimistic swap / direct insert)?
    if (room.messages.some(m => m.id === row.id)) return;

    // My own message still showing its optimistic placeholder?
    if (row.user_id === Store.me()?.id) {
      const ti = room.messages.findIndex(m =>
        m.pending && m.userId === 'me' &&
        m.text === (row.content || '') && m.type === (row.type || 'text'));
      if (ti >= 0) {
        const oldId = room.messages[ti].id;
        room.messages.splice(ti, 1, rowToMsgShim(row));
        Store.emit('msg:replace', { oldId, msg: room.messages[ti] });
        return;
      }
      // Fallback: match any pending placeholder from the same user (handles
      // edge cases where text/type don't match exactly due to formatting).
      const tiFallback = room.messages.findIndex(m =>
        m.pending && m.userId === 'me');
      if (tiFallback >= 0) {
        const oldId = room.messages[tiFallback].id;
        room.messages.splice(tiFallback, 1, rowToMsgShim(row));
        Store.emit('msg:replace', { oldId, msg: room.messages[tiFallback] });
        return;
      }
      // No pending placeholder (e.g. image/poll sent without optimistic, or
      // placeholder already reconciled via HTTP) — treat as fresh insert but
      // avoid double-append (already handled by id check above).
    }

    // Someone else's message or own message without placeholder — fresh insert.
    room.messages.push(rowToMsgShim(row));
    trimAndEmit(row.room_id, row.id);
  }

  function rowToMsgShim(row) {
    return {
      id: row.id, roomId: row.room_id,
      userId: row.user_id || 'sys',
      text: row.content || '',
      ts: Date.parse(row.created_at),
      edited: row.edited || false,
      deleted: row.deleted || false,
      pinned: row.pinned || false,
      type: row.type || 'text',
      replyTo: row.reply_to || null,
      poll: row.poll || null,
      meta: row.meta || null,
      reactions: {}, seen: false
    };
  }

  function trimAndEmit(roomId, id) {
    const room = Store.getRoom(roomId);
    if (!room) return;
    if (room.messages.length > DriftConfig.MESSAGE_WINDOW * 2)
      room.messages.splice(0, room.messages.length - DriftConfig.MESSAGE_WINDOW * 2);
    const m = room.messages.find(x => x.id === id);
    if (m) Store.emit('msg:new', m);
  }

  function routeUpdate(payload) {
    const row = payload.new;
    if (!row) return;
    const room = Store.getRoom(row.room_id);
    if (!room) return;
    const m = room.messages.find(x => x.id === row.id);
    if (!m) return;
    Object.assign(m, {
      text: row.content, edited: row.edited, deleted: row.deleted,
      pinned: row.pinned, type: row.type, poll: row.poll, meta: row.meta
    });
    Store.emit('msg:update', m);
  }

  async function routeReactionInsert(payload) {
    const r = payload.new;
    if (!r) return;
    for (const room of Store.state.rooms) {
      const m = room.messages.find(x => x.id === r.message_id);
      if (m) {
        m.reactions[r.emoji] = m.reactions[r.emoji] || [];
        if (!m.reactions[r.emoji].includes(r.user_id)) m.reactions[r.emoji].push(r.user_id);
        Store.emit('msg:update', m);
        return;
      }
    }
  }
  function routeReactionDelete(payload) {
    const r = payload.old;
    if (!r || !r.message_id) return;
    for (const room of Store.state.rooms) {
      const m = room.messages.find(x => x.id === r.message_id);
      if (m && m.reactions[r.emoji]) {
        m.reactions[r.emoji] = m.reactions[r.emoji].filter(u => u !== r.user_id);
        if (!m.reactions[r.emoji].length) delete m.reactions[r.emoji];
        Store.emit('msg:update', m);
        return;
      }
    }
  }

  function routeNotification(payload) {
    const n = payload.new;
    if (!n || n.user_id !== Store.me()?.id) return;
    const mapped = {
      id: n.id, type: n.type, title: n.title, body: n.body,
      actorId: n.actor_id, roomId: n.room_id,
      ts: Date.parse(n.created_at), read: false
    };
    Store.state.notifications.unshift(mapped);
    Store.emit('notif:new', mapped);
  }

  function routeProfileUpdate(payload) {
    const row = payload.new;
    if (!row) return;
    // Update the profile cache so views reflect the new name/avatar.
    const cached = Store.getUser(row.id);
    if (cached && cached.id === row.id) {
      const mapped = {
        displayName: row.display_name || row.username || cached.displayName,
        avatarEmoji: row.avatar_emoji || '',
        avatarUrl: row.avatar_url || '',
        hue: row.hue ?? cached.hue,
        bio: row.bio || cached.bio,
        statusMsg: row.status_msg || cached.statusMsg
      };
      Object.assign(cached, mapped);
      Store.emit('profile:loaded', cached);
    }
  }

  function refreshPresenceCount() {
    // Count only users who are not appearing offline
    let count = 0;
    for (const [, info] of online) {
      if (info.status !== 'offline') count++;
    }
    Store.state.meta.onlineCount = count;
    Store.emit('presence', count);
    // Update cached profiles' status from presence (so avatar dots reflect away/offline)
    for (const [uid, info] of online) {
      const p = Store.getUser(uid);
      if (p && p.id === uid) {
        p.status = info.status || 'online';
        // For offline-appearing users, keep them in online Map but mark as offline
        // so isOnline can return false
      }
    }
    // For users not in presence, mark as offline if they were previously online
    // (handled lazily via isOnline check)
  }

  function start() {
    if (!SB.configured() || channel) return;
    const meId = Store.me()?.id;

    channel = SB.client.channel('drift-live', { config: { presence: { key: meId } } });

    // --- realtime database streams -----------------------------------------
    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        routeMessage)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        routeUpdate)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reactions' },
        routeReactionInsert)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reactions' },
        routeReactionDelete)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        routeNotification)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rooms' },
        () => Store.refreshRooms().then(() => Store.emit('rooms:changed')).catch(() => {}))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_members' },
        () => Store.refreshRooms().then(() => Store.emit('rooms:changed')).catch(() => {}))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        routeProfileUpdate)

    // --- typing broadcasts --------------------------------------------------
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === Store.me()?.id) return;
        Store.emit('typing', payload);
        setTimeout(() => Store.emit('typing-stop', payload), 6000);
      })

    // --- real presence ------------------------------------------------------
      .on('presence', { event: 'sync' }, () => {
        online.clear();
        Object.entries(channel.presenceState()).forEach(([key, metas]) => {
          const meta = Array.isArray(metas) ? metas[0] : metas;
          if (meta?.user_id) online.set(meta.user_id, { key, status: meta.status || 'online', at: meta.at || Date.now() });
        });
        refreshPresenceCount();
      })
      .subscribe(async status => {
        if (status !== 'SUBSCRIBED') return;
        const me = Store.me();
        if (me) {
          await channel.track({ user_id: me.id, status: me.status || 'online', at: Date.now() });
          Store.touchStreak();
        }
      });

    // Keep presence + last_seen fresh on long-lived tabs.
    heartbeat = setInterval(() => {
      const me = Store.me();
      if (me && channel) channel.track({ user_id: me.id, status: me.status || 'online', at: Date.now() });
      Store.touchPresence();
    }, DriftConfig.PRESENCE_TICK_MS);

    window.addEventListener('beforeunload', () => { try { channel?.untrack(); } catch (e) {} });
  }

  function stop() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (channel) { try { SB.client.removeChannel(channel); } catch (e) {} }
    channel = null;
    online.clear();
  }

  function sendTyping(roomId) {
    if (!channel) return;
    const me = Store.me();
    channel.send({
      type: 'broadcast', event: 'typing',
      payload: { roomId, userId: me?.id, name: me?.displayName }
    }).then(() => {}, () => {});
  }

  const onlineUserIds = () => [...online.entries()].filter(([,info]) => info.status !== 'offline').map(([id]) => id);

  /** Presence check that treats the local 'me' sentinel and my real uuid as
       one and the same person — prevents double-counting in member lists. */
  function isOnline(id) {
    if (!id) return false;
    if (id === 'me') id = Store.me()?.id;
    const info = id && online.get(id);
    return !!info && info.status !== 'offline';
  }

  function getStatus(id) {
    if (!id) return 'offline';
    if (id === 'me') id = Store.me()?.id;
    const info = id && online.get(id);
    if (info) return info.status || 'online';
    // Not in presence → check cached profile directly to avoid circular call
    const cached = Store.getUser(id);
    if (cached && cached.status && cached.status !== 'online') return cached.status;
    return 'offline';
  }

  function updateStatus(status) {
    const me = Store.me();
    if (!me) return;
    me.status = status;
    // Persist to localStorage/DB via Store
    Store.touchProfile();
    if (channel) {
      channel.track({ user_id: me.id, status, at: Date.now() }).then(()=>{},()=>{});
    }
    // Update local presence map immediately so UI reflects without waiting for sync
    online.set(me.id, { key: me.id, status, at: Date.now() });
    // Also update cached profile
    const cached = Store.getUser(me.id);
    if (cached) cached.status = status;
    refreshPresenceCount();
    Store.emit('presence', Store.state.meta.onlineCount);
    window.AppShell?.refreshIdentity?.();
  }

  return { start, stop, sendTyping, onlineUserIds, isOnline, getStatus, updateStatus };
})();
