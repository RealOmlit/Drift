/* ==========================================================================
   Drift · rooms.js — REAL room discovery, creation, membership & settings.
   Rooms live in Postgres; joining/leaving/creating hits the database and
   realtime keeps every connected client in sync.
   ========================================================================== */

window.Rooms = (() => {
  'use strict';

  /* Category metadata: label + icon + signature gradient */
  const CATEGORIES = {
    general:    { label: 'General',    icon: 'globe',   grad: 'linear-gradient(135deg,#7c5cff,#22d3ee)' },
    gaming:     { label: 'Gaming',     icon: 'gamepad', grad: 'linear-gradient(135deg,#f43f5e,#a78bfa)' },
    technology: { label: 'Technology', icon: 'cpu',     grad: 'linear-gradient(135deg,#0ea5e9,#22d3ee)' },
    study:      { label: 'Study',      icon: 'book',    grad: 'linear-gradient(135deg,#10b981,#84cc16)' },
    music:      { label: 'Music',      icon: 'music',   grad: 'linear-gradient(135deg,#f472b6,#fbbf24)' },
    memes:      { label: 'Memes',      icon: 'laugh',   grad: 'linear-gradient(135deg,#fb923c,#f43f5e)' },
    coding:     { label: 'Coding',     icon: 'code',    grad: 'linear-gradient(135deg,#818cf8,#22d3ee)' },
    sports:     { label: 'Sports',     icon: 'trophy',  grad: 'linear-gradient(135deg,#34d399,#0ea5e9)' },
    design:     { label: 'Design',     icon: 'palette', grad: 'linear-gradient(135deg,#e879f9,#7c5cff)' },
    random:     { label: 'Random',     icon: 'dice',    grad: 'linear-gradient(135deg,#fbbf24,#fb7185)' }
  };

  const state = { category: 'all', search: '', sort: 'newest' };
  const myId = () => Store.me()?.id;
  const isJoined = room => Array.isArray(room?.members) && room.members.includes('me');
  const isOwner = room => !!myId() && room.ownerId === myId();
  const isMod = room => isOwner(room) || (room.mods || []).includes(myId());
  const catOf = key => CATEGORIES[key] || CATEGORIES.general;

  /* ============================== Cards ============================== */
  function roomCard(room) {
    const c = catOf(room.category);
    const joined = isJoined(room);
    const fresh = Date.now() - room.createdAt < 864e5 * 3;   // created within 3 days
    return `
      <article class="card card-glow hoverable room-card ${joined ? 'joined-mark' : ''}" data-room="${room.id}">
        ${fresh && !joined ? '<span class="badge badge-new rc-badge">✦ New</span>' : ''}
        <div class="rc-top">
          <div class="rc-icon" style="--rc-bg:${c.grad}">${room.visibility === 'private' ? U.icon('lock', 20) : room.icon}</div>
          <div class="grow">
            <div class="rc-title">${U.esc(room.name)}</div>
            <div class="rc-cat">${c.label}</div>
          </div>
        </div>
        <p class="rc-desc">${U.esc(room.desc)}</p>
        <div class="rc-foot">
          <span class="row" style="gap:.35rem;">${U.icon('users', 14)} ${U.fmtCount(room.memberCount)}</span>
          <span class="sep"></span>
          <span style="margin-left:auto;">
            ${joined ? '<b style="color:var(--ok);font-size:.78rem;">Joined</b>'
                     : room.visibility === 'private' ? `<span class="badge badge-lock">${U.icon('lock',11)} Private</span>`
                     : '<b style="color:var(--ac2);font-size:.78rem;">Open</b>'}
          </span>
        </div>
      </article>`;
  }

  function miniRoomCard(room) {
    const c = catOf(room.category);
    return `
      <article class="card hoverable mini-room" data-room="${room.id}">
        <div class="spread">
          <div class="mr-icon" style="--av-bg:${c.grad}">${room.icon}</div>
          ${isJoined(room) ? '<span class="badge badge-new">joined</span>' : ''}
        </div>
        <div>
          <div style="font-family:var(--font-d);font-weight:700;font-size:.95rem;">${U.esc(room.name)}</div>
          <div class="small faint">${U.fmtCount(room.memberCount)} members</div>
        </div>
        <div class="mr-meta">
          <span>${catOf(room.category).label}</span><span>·</span>
          <span>${isJoined(room) ? '<span style="color:var(--ok)">joined</span>' : 'open'}</span>
        </div>
      </article>`;
  }

  /** Global click delegation for any [data-room] card. */
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-room]');
    if (card && !e.target.closest('button')) Router.go('room', [card.dataset.room]);
  });

  /* ============================ Discover page ============================ */
  function renderDiscoverPage(root) {
    root.innerHTML = `
      <div class="view-inner">
        <div class="view-head spread">
          <div>
            <h1>Discover rooms</h1>
            <p class="sub">Find your people — or build a home for them.</p>
          </div>
          <button class="btn btn-primary" id="btnCreateRoom">${U.icon('plus', 17)} Create room</button>
        </div>

        <div class="toolbar">
          <div class="input-wrap grow" style="min-width:220px;">
            ${U.icon('search', 16, 'lead')}
            <input class="input" id="discSearch" placeholder="Search rooms…" value="${U.esc(state.search)}">
          </div>
          <div class="seg" id="discSort">
            ${['biggest', 'newest'].map(s => `<button data-sort="${s}" class="${state.sort === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
          </div>
        </div>

        <div class="chip-row" id="discCats" style="margin-bottom:1.1rem;"></div>
        <div id="discGrid"><div class="view-inner">${UI.skeletonCards(6)}</div></div>
      </div>`;

    drawCategoryChips();
    drawGrid();

    root.querySelector('#discSearch').addEventListener('input', U.debounce(e => { state.search = e.target.value.toLowerCase(); drawGrid(); }, 160));
    root.querySelector('#discSort').addEventListener('click', e => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      state.sort = b.dataset.sort;
      root.querySelectorAll('#discSort button').forEach(x => x.classList.toggle('on', x === b));
      drawGrid();
    });
    root.querySelector('#btnCreateRoom').addEventListener('click', () => createRoomModal());
  }

  function drawCategoryChips() {
    const wrap = U.$('#discCats'); if (!wrap) return;
    wrap.innerHTML = [`<button class="chip ${state.category === 'all' ? 'on' : ''}" data-cat="all">✦ All</button>`]
      .concat(Object.entries(CATEGORIES).map(([k, c]) =>
        `<button class="chip ${state.category === k ? 'on' : ''}" data-cat="${k}">${c.label}</button>`)).join('');
    wrap.onclick = e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      state.category = b.dataset.cat;
      drawCategoryChips(); drawGrid();
    };
  }

  function visibleRooms() {
    let rooms = Store.state.rooms.filter(r => r.visibility !== 'private' || isJoined(r));
    if (state.category !== 'all') rooms = rooms.filter(r => r.category === state.category);
    if (state.search) rooms = rooms.filter(r =>
      r.name.toLowerCase().includes(state.search) ||
      r.desc.toLowerCase().includes(state.search) ||
      (r.tags || []).some(t => t.includes(state.search)) ||
      r.category.includes(state.search));
    if (state.sort === 'biggest') rooms = [...rooms].sort((a, b) => b.memberCount - a.memberCount);
    else rooms = [...rooms].sort((a, b) => b.createdAt - a.createdAt);
    return rooms;
  }

  function drawGrid() {
    const grid = U.$('#discGrid'); if (!grid) return;
    const rooms = visibleRooms();
    if (!rooms.length) {
      grid.innerHTML = `<div class="empty"><div class="e-icon">${U.icon('search', 24)}</div>
        <h4>No rooms match that</h4><p>Try another category — or start the room yourself.</p>
        <button class="btn btn-primary btn-sm" onclick="Rooms.createRoomModal()">Create a room</button></div>`;
      return;
    }
    grid.innerHTML = `<div class="rooms-grid">${rooms.map(roomCard).join('')}</div>`;
  }

  /* ============================ My Rooms page ============================ */
  function renderMyRoomsPage(root) {
    const joined = Store.state.rooms.filter(isJoined);
    const owned = joined.filter(isOwner);
    const suggested = Store.state.rooms.filter(r => !isJoined(r) && r.visibility === 'public')
      .sort((a, b) => b.memberCount - a.memberCount).slice(0, 6);

    root.innerHTML = `
      <div class="view-inner">
        <div class="view-head spread">
          <div><h1>Your rooms</h1><p class="sub">${joined.length} joined · ${owned.length} owned by you</p></div>
          <button class="btn btn-primary" id="btnCreate2">${U.icon('plus', 17)} Create room</button>
        </div>
        ${joined.length ? `<div class="section-label">${U.icon('layers', 17)} Joined rooms</div>
        <div class="rooms-grid">${joined.map(roomCard).join('')}</div>` :
        `<div class="empty"><div class="e-icon">${U.icon('layers', 26)}</div><h4>No rooms yet</h4>
          <p>Join a public room or spin up your own — it takes about ten seconds.</p>
          <button class="btn btn-primary btn-sm" id="btnCreateEmpty">Browse discover</button></div>`}
        ${suggested.length ? `<div class="section-label">${U.icon('flame', 17)} Popular right now</div>
        <div class="rooms-grid">${suggested.map(miniRoomCard).join('')}</div>` : ''}
      </div>`;
    root.querySelector('#btnCreate2').addEventListener('click', () => createRoomModal());
    root.querySelector('#btnCreateEmpty')?.addEventListener('click', () => Router.go('discover'));
  }

  /* ========================= Join / leave / create ========================= */
  async function joinRoom(roomId, opts = {}) {
    let room = Store.getRoom(roomId);
    if (room && isJoined(room)) return true;

    if ((!room || room.visibility === 'private') && !opts.codeTrusted) {
      const code = await UI.prompt({
        title: `🔒 Private room`,
        label: 'Enter invite code',
        placeholder: 'DRIFT-XXXX',
        okLabel: 'Join'
      });
      if (code == null) return false;
      try {
        const newId = await SB.unwrap(SB.client.rpc('join_room_with_code', { code }));
        roomId = roomId || newId;
        await Store.refreshRooms();
        room = Store.getRoom(newId) || Store.getRoom(roomId);
      } catch (e) {
        UI.toast({ title: 'Couldn\u2019t join', body: e.message, type: 'bad', icon: 'lock' });
        return false;
      }
    } else {
      try { await Store.joinRoomDb(roomId); } catch (e) {
        UI.toast({ title: 'Couldn\u2019t join', body: e.message, type: 'bad', icon: 'alert' });
        return false;
      }
    }
    if (!room) return false;
    room.members = [...new Set([...room.members, 'me'])];
    room.memberCount += 1;
    Store.emit('room:update', room);
    Notifs.push('system', { title: `Welcome to ${room.name}`, body: 'Say hi — first messages get the best seats.', roomId, silent: false });
    Store.addXP(10, 'Joined a new community');
    UI.toast({ title: `Joined ${room.name}`, body: '+10 XP · welcome aboard', type: 'xp', icon: 'sparkles' });
    return true;
  }

  async function leaveRoom(roomId) {
    const room = Store.getRoom(roomId); if (!room) return;
    if (isOwner(room)) {
      UI.toast({ title: 'You own this room', body: 'Delete it from room settings instead.', type: 'warn', icon: 'crown' });
      return;
    }
    if (!(await UI.confirm({ title: `Leave ${room.name}?`, body: 'You can rejoin any time unless it\u2019s private.', okLabel: 'Leave', danger: true }))) return;
    try { await Store.leaveRoomDb(roomId); } catch (e) {
      UI.toast({ title: 'Couldn\u2019t leave', body: e.message, type: 'bad', icon: 'alert' });
      return;
    }
    room.members = room.members.filter(m => m !== 'me');
    room.memberCount -= 1;
    delete Store.me().reads[roomId];
    Store.touchProfile();
    UI.toast({ title: `Left ${room.name}`, type: 'info', icon: 'logout' });
    if (Router.current?.name === 'room' && Router.current.params[0] === roomId) Router.go('rooms');
  }

  function createRoomModal() {
    const cats = Object.entries(CATEGORIES);
    const m = UI.openModal({
      wide: true,
      title: `${U.icon('plus', 18)} Create a room`,
      body: `
        <div class="field"><label>Room name</label>
          <input class="input" id="crName" maxlength="40" placeholder="e.g. Midnight Makers">
        </div>
        <div class="row" style="align-items:flex-start;gap:1rem;">
          <div class="field" style="flex:1;">
            <label>Description</label>
            <textarea class="input" id="crDesc" rows="3" maxlength="160" placeholder="What's the vibe?"></textarea>
            ${DriftConfig.AI_ENABLED ? `<div class="input-hint row" style="justify-content:flex-end;">
              <button class="lnk" id="crAI" style="color:var(--ac2);font-weight:600;font-size:.8rem;">✨ Generate with Zephyr</button>
            </div>` : ''}
          </div>
          <div class="field" style="width:120px;">
            <label>Icon</label>
            <button class="input" id="crIcon" style="font-size:1.5rem;text-align:center;padding:.45rem;">🚀</button>
          </div>
        </div>
        <div class="field"><label>Category</label>
          <div class="chip-row" id="crCats" style="flex-wrap:wrap;overflow:visible;">
            ${cats.map(([k, c], i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-k="${k}">${c.label}</button>`).join('')}
          </div>
        </div>
        <div class="field"><label>Visibility</label>
          <div class="seg" id="crVis">
            <button class="on" data-v="public">${U.icon('globe', 15)} Public</button>
            <button data-v="private">${U.icon('lock', 15)} Private</button>
          </div>
          <div class="input-hint">Private rooms need an invite code to join.</div>
        </div>
        <div class="card" id="crPreview" style="margin-top:.4rem;"></div>`,
      footer: `<button class="btn btn-glass" data-close2>Cancel</button>
               <button class="btn btn-primary" id="crGo">${U.icon('rocket', 16)} Launch room</button>`
    });

    const form = { name: '', desc: '', icon: '🚀', category: 'general', visibility: 'public' };
    const $n = m.card.querySelector('#crName'), $d = m.card.querySelector('#crDesc');

    function preview() {
      m.card.querySelector('#crPreview').innerHTML =
        roomCard({ id: '', name: form.name || 'Your Room Name', desc: form.desc || 'Your description appears here — set the tone.', icon: form.icon, category: form.category, memberCount: 1, visibility: form.visibility, tags: [], createdAt: Date.now() }).replace('data-room=""', '');
    }
    preview();

    $n.addEventListener('input', () => { form.name = $n.value; preview(); });
    $d.addEventListener('input', () => { form.desc = $d.value; preview(); });
    m.card.querySelectorAll('#crCats .chip').forEach(b => b.addEventListener('click', () => {
      form.category = b.dataset.k;
      m.card.querySelectorAll('#crCats .chip').forEach(x => x.classList.toggle('on', x === b));
      preview();
    }));
    m.card.querySelectorAll('#crVis button').forEach(b => b.addEventListener('click', () => {
      form.visibility = b.dataset.v;
      m.card.querySelectorAll('#crVis button').forEach(x => x.classList.toggle('on', x === b));
      preview();
    }));
    const crIconBtn = m.card.querySelector('#crIcon');
    crIconBtn.addEventListener('click', () => {
      UI.emojiPicker(crIconBtn, em => { form.icon = em; crIconBtn.textContent = em; preview(); });
    });
    m.card.querySelector('#crAI')?.addEventListener('click', () => {
      const btn = m.card.querySelector('#crAI');
      btn.textContent = '✨ Thinking…';
      const text = AI.roomDescription(form.name.trim() || 'New Room', form.category);
      setTimeout(() => { $d.value = text; form.desc = text; preview(); btn.textContent = '✨ Regenerate'; }, 500);
    });
    m.card.querySelector('[data-close2]').addEventListener('click', m.close);

    m.card.querySelector('#crGo').addEventListener('click', async () => {
      if (form.name.trim().length < 3) { UI.toast({ title: 'Name too short', body: 'Give it at least 3 characters.', type: 'warn' }); return; }
      const go = m.card.querySelector('#crGo');
      go.disabled = true;
      try {
        const rows = await SB.unwrap(
          SB.client.from('rooms').insert({
            name: form.name.trim(),
            description: form.desc.trim() || 'A brand-new Drift room.',
            icon: form.icon,
            category: form.category,
            visibility: form.visibility,
            invite_code: form.visibility === 'private'
              ? 'DRIFT-' + Math.random().toString(36).slice(2, 6).toUpperCase()
              : null,
            owner_id: Store.me().id,
            mods: [Store.me().id],
            rules: ['Be kind. Keep it relevant. Mods have final say.']
          }).select('*')
        );
        const r = rows[0];
        await Store.joinRoomDb(r.id);
        await Store.refreshRooms();
        const room = Store.getRoom(r.id);
        // Opening system message (real, persisted, pinned)
        await Store.composeMessage(r.id, 'me',
          `🎉 ${form.name.trim()} is officially open! Pin your house rules here.`,
          { type: 'system' }).then(msg => msg && Store.updateMessage(r.id, msg.id, { pinned: true }));
        Store.addXP(25, 'Created a room');
        m.close();
        UI.toast({ title: `${room?.name || form.name} is live 🚀`, body: 'Invite friends from the room menu.', type: 'xp', icon: 'rocket' });
        UI.confetti(innerWidth / 2, innerHeight * 0.35);
        Router.go('room', [r.id]);
      } catch (e) {
        go.disabled = false;
        UI.toast({ title: 'Couldn\u2019t create room', body: e.message, type: 'bad', icon: 'alert' });
      }
    });
  }

  /* =========================== Room settings =========================== */
  function settingsModal(roomId) {
    const room = Store.getRoom(roomId); if (!room) return;
    const meUid = myId();
    const owner = isOwner(room);
    const mod = isMod(room);

    const m = UI.openModal({
      wide: true,
      title: `${U.icon('gear', 18)} ${U.esc(room.name)} — settings`,
      body: `
        <fieldset ${owner ? '' : 'disabled'} style="border:none;">
          <div class="field"><label>Room name</label><input class="input" id="rsName" value="${U.esc(room.name)}" maxlength="40"></div>
          <div class="field"><label>Description</label><textarea class="input" id="rsDesc" rows="2" maxlength="160">${U.esc(room.desc)}</textarea></div>
          <div class="row" style="gap:1rem;">
            <div class="field" style="width:110px;"><label>Icon</label><button class="input" id="rsIcon" style="font-size:1.4rem;">${room.icon}</button></div>
            <div class="field grow"><label>Rules (one per line)</label><textarea class="input" id="rsRules" rows="3">${U.esc((room.rules || []).join('\n'))}</textarea></div>
          </div>
        </fieldset>
        <div class="set-group">
          <div class="card set-row">
            <div class="s-main"><b>Slow mode</b><p>Limit how often members can send messages.</p></div>
            <select class="input" id="rsSlow" style="width:130px;">
              ${[[0,'Off'],[5,'5 seconds'],[15,'15 seconds'],[30,'30 seconds'],[60,'1 minute']].map(([v,l]) => `<option value="${v}" ${(room.slowMode||0)===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="card set-row">
            <div class="s-main"><b>Moderators</b><p>${owner ? 'Tap members below to grant or revoke moderator powers.' : 'Only the owner can change moderators.'}</p></div>
            <span class="badge badge-live">${(room.mods||[]).length + (room.mods.includes(room.ownerId) ? 0 : 1)} mods</span>
          </div>
          <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:.15rem;" id="rsMembers">
            ${room.members.map(uid => {
              if (uid === 'me') return '';
              const u = Store.getUser(uid); if (!u) return '';
              const role = uid === room.ownerId ? 'owner' : (room.mods || []).includes(uid) ? 'mod' : '';
              return `<button class="member-row" data-uid="${uid}">
                ${U.avatar(u, { size: 32 })}
                <span class="mr-info"><span class="mr-n">${U.esc(u.displayName)} ${role ? `<span class="role-tag ${role}">${role}</span>` : ''}</span></span>
                ${uid !== meUid && owner ? `<span class="small" style="color:${role === 'mod' ? 'var(--bad)' : 'var(--ac2)'};font-weight:600;">${role === 'mod' ? 'Revoke' : 'Promote'}</span>` : ''}
              </button>`;
            }).join('')}
          </div>
          ${room.privateCode ? `<div class="card set-row"><div class="s-main"><b>Invite code</b><p>Share with people you trust.</p></div><code class="mono" id="rsCode" style="cursor:pointer;">${room.privateCode}</code></div>` : ''}
          ${owner ? `<div class="card set-row" style="border-color:rgba(251,113,133,.35);">
            <div class="s-main"><b>Danger zone</b><p>Deleting removes all messages permanently.</p></div>
            <button class="btn btn-danger btn-sm" id="rsDelete">${U.icon('trash', 15)} Delete room</button></div>` : ''}
        </div>`,
      footer: owner ? `<button class="btn btn-primary" id="rsSave">Save changes</button>
                      <button class="btn btn-glass" data-close2>Close</button>`
                    : `<button class="btn btn-glass" data-close2>Close</button>`
    });

    const rsIconBtn = m.card.querySelector('#rsIcon');
    rsIconBtn.addEventListener('click', () => {
      UI.emojiPicker(rsIconBtn, em => { rsIconBtn.textContent = em; });
    });
    m.card.querySelector('#rsCode')?.addEventListener('click', async e => {
      await UI.copyText(room.privateCode);
      UI.toast({ title: 'Invite code copied', type: 'ok', icon: 'copy' });
    });
    if (mod) {
      m.card.querySelector('#rsSlow').addEventListener('change', async e => {
        const val = parseInt(e.target.value, 10);
        try {
          await SB.unwrap(SB.client.from('rooms').update({ slow_mode: val }).eq('id', roomId));
          room.slowMode = val;
          UI.toast({ title: `Slow mode ${val ? 'every ' + val + 's' : 'off'}`, type: 'ok', icon: 'clock' });
        } catch (err) {
          UI.toast({ title: 'Save failed', body: err.message, type: 'bad', icon: 'alert' });
        }
      });
    }
    m.card.querySelector('#rsMembers').addEventListener('click', e => {
      const row = e.target.closest('[data-uid]'); if (!row) return;
      const uid = row.dataset.uid;
      if (!owner || uid === meUid || uid === room.ownerId) return;
      room.mods = room.mods || [];
      const i = room.mods.indexOf(uid);
      if (i >= 0) { room.mods.splice(i, 1); }
      else { room.mods.push(uid); }
      SB.unwrap(SB.client.from('rooms').update({ mods: room.mods }).eq('id', roomId))
        .catch(err => UI.toast({ title: 'Save failed', body: err.message, type: 'bad', icon: 'alert' }));
      m.close(); settingsModal(roomId);
    });
    m.card.querySelector('#rsDelete')?.addEventListener('click', async () => {
      m.close();
      if (!(await UI.confirm({ title: `Delete ${room.name}?`, body: 'Every message disappears forever. There is no undo.', okLabel: 'Delete forever', danger: true }))) return;
      try {
        await SB.unwrap(SB.client.from('rooms').delete().eq('id', roomId));
        Store.state.rooms = Store.state.rooms.filter(r => r.id !== roomId);
        UI.toast({ title: 'Room deleted', type: 'info', icon: 'trash' });
        Router.go('rooms');
      } catch (e) {
        UI.toast({ title: 'Delete failed', body: e.message, type: 'bad', icon: 'alert' });
      }
    });
    m.card.querySelector('[data-close2]').addEventListener('click', m.close);
    m.card.querySelector('#rsSave')?.addEventListener('click', async () => {
      const patch = {
        name: m.card.querySelector('#rsName').value.trim() || room.name,
        description: m.card.querySelector('#rsDesc').value.trim(),
        rules: m.card.querySelector('#rsRules').value.split('\n').map(x => x.trim()).filter(Boolean),
        icon: m.card.querySelector('#rsIcon').textContent.trim() || room.icon
      };
      try {
        await SB.unwrap(SB.client.from('rooms').update(patch).eq('id', roomId));
        Object.assign(room, { name: patch.name, desc: patch.description, rules: patch.rules, icon: patch.icon });
        Store.emit('room:update', room);
        m.close();
        UI.toast({ title: 'Room updated', type: 'ok', icon: 'check' });
        if (Router.current?.name === 'room' && Router.current.params[0] === roomId) Chat.rerender();
      } catch (e) {
        UI.toast({ title: 'Save failed', body: e.message, type: 'bad', icon: 'alert' });
      }
    });
  }

  return { CATEGORIES, catOf, isJoined, isOwner, isMod, joinRoom, leaveRoom, createRoomModal, settingsModal,
           renderDiscoverPage, renderMyRoomsPage, roomCard, miniRoomCard };
})();
