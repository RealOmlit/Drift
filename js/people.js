/* ==========================================================================
   Drift · people.js — people directory, friends, and profile cards.
   ========================================================================== */

window.People = (() => {
  'use strict';

  const state = { tab: 'online', q: '' };
  const isFriend = id => Store.me()?.following.includes(id) && Store.me().followers.includes(id);

  /* ============================== Page ============================== */
  function renderPage(root) {
    root.innerHTML = `
      <div class="view-inner">
        <div class="view-head">
          <h1>People</h1>
          <p class="sub"><span class="dot online" style="display:inline-block;vertical-align:baseline;"></span>
            <b data-online-count>—</b> drifters online right now</p>
        </div>

        <div class="toolbar">
          <div class="input-wrap grow" style="min-width:200px;">
            ${U.icon('search', 16, 'lead')}
            <input class="input" id="ppSearch" placeholder="Search people…" value="${U.esc(state.q)}">
          </div>
          <div class="seg" id="ppTabs">
            ${['friends', 'requests', 'online', 'all'].map(t =>
              `<button data-t="${t}" class="${state.tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}${t === 'requests' && pendingRequests().length ? ` (${pendingRequests().length})` : ''}</button>`).join('')}
          </div>
        </div>

        <div id="ppGrid"></div>
      </div>`;

    drawGrid();
    U.$('#ppSearch').addEventListener('input', U.debounce(e => { state.q = e.target.value.toLowerCase(); drawGrid(); }, 140));
    U.$('#ppTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      state.tab = b.dataset.t;
      U.$$('#ppTabs button').forEach(x => x.classList.toggle('on', x === b));
      drawGrid();
    });
  }

  const pendingRequests = () =>
    DemoData.users.filter(u => Store.me()?.followers.includes(u.id) && !Store.me().following.includes(u.id));

  function filteredUsers() {
    let users = [...DemoData.users];
    if (state.tab === 'friends') users = users.filter(u => isFriend(u.id));
    else if (state.tab === 'requests') users = pendingRequests();
    else if (state.tab === 'online') users = users.filter(u => u.status !== 'offline');
    if (state.q) users = users.filter(u =>
      u.username.toLowerCase().includes(state.q) ||
      u.displayName.toLowerCase().includes(state.q) ||
      (u.bio || '').toLowerCase().includes(state.q));
    return users;
  }

  function personCard(u) {
    const friend = isFriend(u.id);
    const mutual = mutualRooms(u).length;
    return `
      <article class="card card-glow hoverable person-card" data-open-user="${u.id}">
        ${U.avatar(u, { size: 62, presence: true, ring: true })}
        <div class="p-name">${U.esc(u.displayName)}
          ${u.status === 'online' ? '<span class="dot online"></span>' : ''}
        </div>
        <div class="small faint">@${U.esc(u.username)}</div>
        <div class="p-status">${U.esc(u.statusMsg || '')}</div>
        <div class="small faint">${u.status === 'offline' ? 'last seen ' + U.fmtRel(u.lastSeen || Date.now() - 36e5) : mutual + ' shared room' + (mutual === 1 ? '' : 's')}</div>
        <div class="p-actions">
          ${friend
            ? `<button class="btn btn-glass btn-sm" data-act="unfriend" data-u="${u.id}">Friends ✓</button>`
            : `<button class="btn btn-primary btn-sm" data-act="add" data-u="${u.id}">${U.icon('user-plus', 14)} Connect</button>`}
          <button class="icon-btn sm" data-act="menu" data-u="${u.id}" aria-label="More">${U.icon('dots', 15)}</button>
        </div>
      </article>`;
  }

  function requestBanner(u) {
    return `
      <div class="card req-banner">
        ${U.avatar(u, { size: 46 })}
        <div><b>${U.esc(u.displayName)}</b><div class="small muted">wants to connect with you</div></div>
        <div class="req-actions">
          <button class="btn btn-ok btn-sm" data-act="accept" data-u="${u.id}">${U.icon('check', 14)} Accept</button>
          <button class="btn btn-glass btn-sm" data-act="reject" data-u="${u.id}">Ignore</button>
        </div>
      </div>`;
  }

  function drawGrid() {
    const grid = U.$('#ppGrid'); if (!grid) return;

    if (state.tab === 'requests') {
      const reqs = pendingRequests();
      grid.innerHTML = reqs.length
        ? `<div class="page-grid">${reqs.map(requestBanner).join('')}</div>`
        : emptyHTML('No pending requests', 'When someone wants to connect, they\'ll show up here.');
      bindGrid(grid); return;
    }

    const users = filteredUsers();
    grid.innerHTML = users.length
      ? `<div class="people-grid">${users.map(personCard).join('')}</div>`
      : emptyHTML('Nobody found', 'Try a different search or switch tabs.');
    bindGrid(grid);
  }

  const emptyHTML = (t, p) => `<div class="empty"><div class="e-icon">${U.icon('users', 24)}</div><h4>${t}</h4><p>${p}</p></div>`;

  function bindGrid(grid) {
    grid.onclick = e => {
      const actBtn = e.target.closest('[data-act]');
      const uid = actBtn?.dataset.u;
      const card = e.target.closest('[data-open-user]');

      if (actBtn && uid) {
        e.stopPropagation();
        if (actBtn.dataset.act === 'menu') { userMenu(actBtn, uid); return; }
        handleAction(actBtn.dataset.act, uid);
        return;
      }
      if (card) openProfileCard(card.dataset.openUser);
    };
  }

  function handleAction(act, uid) {
    const meP = Store.me();
    switch (act) {
      case 'add': {
        if (!meP.pendingSent.includes(uid)) {
          meP.pendingSent.push(uid);
          Notifs.push('friend', { title: 'Request sent', body: `${Store.getUser(uid)?.displayName} will be notified`, actorId: uid, silent: true });
          // Simulated acceptance a bit later [BACKEND: real-time acceptance]
          setTimeout(() => acceptSimulatedRequest(Store.getUser(uid)), U.randInt(6000, 16000));
        }
        UI.toast({ title: 'Request sent ✦', body: `Connecting with ${Store.getUser(uid)?.displayName}`, type: 'ok', icon: 'user-plus' });
        break;
      }
      case 'accept': {
        meP.following.push(uid);
        meP.followers = meP.followers.filter(f => f !== uid); // consumed the inbound request
        Store.addXP(6, 'New connection');
        UI.toast({ title: 'You are now connected 🎉', body: `${Store.getUser(uid)?.displayName} joined your circle`, type: 'xp', icon: 'user-plus' });
        break;
      }
      case 'reject': meP.followers = meP.followers.filter(f => f !== uid); break;
      case 'unfriend': {
        meP.following = meP.following.filter(f => f !== uid);
        meP.followers = meP.followers.filter(f => f !== uid);
        UI.toast({ title: 'Connection removed', type: 'info', icon: 'x' });
        break;
      }
    }
    Store.save();
    drawGrid();
  }

  /** Called by the realtime sim when a bot "accepts" your request. */
  function acceptSimulatedRequest(bot) {
    const meP = Store.me();
    if (!bot || !meP) return;
    if (!meP.following.includes(bot.id)) meP.following.push(bot.id);
    if (!meP.followers.includes(bot.id)) meP.followers.push(bot.id);
    meP.pendingSent = meP.pendingSent.filter(x => x !== bot.id);
    Store.save();
    Notifs.push('friend', { title: `${bot.displayName} accepted your request`, body: 'Say hi on their profile', actorId: bot.id });
  }

  function userMenu(anchor, uid) {
    const u = Store.getUser(uid);
    const meP = Store.me();
    const blocked = Mod.isBlocked(uid), muted = Mod.isMuted(uid);
    UI.menu(anchor, [
      { label: 'View profile', icon: 'user', onClick: () => openProfileCard(uid) },
      ...(isFriend(uid)
        ? [{ label: 'Remove connection', icon: 'x', onClick: () => handleAction('unfriend', uid) }]
        : [{ label: 'Connect', icon: 'user-plus', onClick: () => handleAction('add', uid) }]),
      { sepBefore: true },
      { label: muted ? 'Unmute' : 'Mute', icon: 'volume', onClick: () => Mod.toggleMute(uid) },
      { label: blocked ? 'Unblock' : 'Block', icon: 'ban', danger: true, onClick: () => Mod.toggleBlock(uid) },
      { label: 'Report', icon: 'flag', danger: true, onClick: () => Mod.reportUser(uid) }
    ]);
  }

  const mutualRooms = u => Store.state.rooms.filter(r => r.members.includes('me') && r.members.includes(u.id));

  /* =========================== Profile card =========================== */
  function openProfileCard(userId) {
    const self = userId === 'me';
    const u = self ? Store.me() : Store.getUser(userId);
    if (!u) return;
    const info = Store.lvlInfo(u.xp || 0);
    const stats = self ? u.stats : pseudoStats(u);
    const badges = badgeList(u, stats);

    const m = UI.openModal({
      slim: true,
      title: self ? 'Your profile' : 'Profile',
      onClose: null,
      body: `
        <style>.modal-body{padding:0 0 .8rem!important;overflow-x:hidden;}
               .pc-inner{padding:0 1.3rem;}</style>
        <div class="pc-cover" style="--pc-grad:${U.avatarBg(u)}"></div>
        <div class="pc-inner">
          <div class="pc-avatar-wrap">
            <span class="level-ring">${U.avatar(u, { size: 84, presence: true })}</span>
            ${self ? '<button class="btn btn-glass btn-sm" data-edit>Edit</button>' : ''}
          </div>
          <div class="pc-name">${U.esc(u.displayName)}
            ${badges.map(b => `<span title="${b.label}">${b.icon}</span>`).join('')}
          </div>
          <div class="pc-handle">@${U.esc(u.username)} · Level ${info.level}</div>
          ${u.statusMsg ? `<div class="pc-bio">"${U.esc(u.statusMsg)}"</div>` : ''}
          ${u.bio ? `<div class="pc-bio">${U.esc(u.bio)}</div>` : ''}
          <div class="small faint" style="margin-top:.35rem;">
            ${u.status === 'offline' ? 'Last seen ' + U.fmtRel(u.lastSeen || Date.now()) : u.status === 'away' ? 'Away — may be afk' : 'Online now'}
          </div>

          <div class="pc-level">
            <div class="spread small"><span class="muted">Community XP</span><b>${U.fmtCount(info.cur)} XP</b></div>
            <div class="lv-bar"><div class="lv-fill" style="width:${info.pct}%"></div></div>
            <div class="small faint" style="margin-top:.25rem;">${info.nextLvl - info.cur} XP to level ${info.level + 1}</div>
          </div>

          <div class="pc-stats">
            <div class="pc-stat"><b>${U.fmtCount(stats.msgs)}</b><span>Messages</span></div>
            <div class="pc-stat"><b>${U.fmtCount(stats.reactions)}</b><span>Reactions</span></div>
            <div class="pc-stat"><b>${mutualRooms(u).length}</b><span>Shared rooms</span></div>
            <div class="pc-stat"><b>${Math.max(1, Math.round((Date.now() - u.joinedAt) / 864e5))}</b><span>Days here</span></div>
          </div>

          ${!self ? `
          <div class="row" style="margin-top:1rem;">
            ${isFriend(userId)
              ? '<button class="btn btn-glass grow" data-unfriend>Friends ✓</button>'
              : '<button class="btn btn-primary grow" data-connect>' + U.icon('user-plus', 16) + ' Connect</button>'}
            <button class="icon-btn" data-menu aria-label="More">${U.icon('dots')}</button>
          </div>` : ''}
        </div>`
    });

    const card = m.card;
    card.querySelector('[data-edit]')?.addEventListener('click', () => { m.close(); Router.go('settings', null, 'profile'); });
    card.querySelector('[data-connect]')?.addEventListener('click', e => {
      handleAction('add', userId);
      e.currentTarget.outerHTML = '<button class="btn btn-glass grow">Pending…</button>';
    });
    card.querySelector('[data-unfriend]')?.addEventListener('click', () => { handleAction('unfriend', userId); m.close(); });
    card.querySelector('[data-menu]')?.addEventListener('click', e => userMenu(e.currentTarget, userId));

    // animate XP bar in
    setTimeout(() => { /* width transition handles it */ }, 60);
  }

  function pseudoStats(u) {
    const h = U.hashCode(u.username);
    return { msgs: 40 + h % 900, reactions: 20 + h % 400 };
  }

  function badgeList(u, stats) {
    const b = [];
    b.push({ icon: '🚀', label: 'Early Drifter' });
    if ((stats.msgs || 0) > 50) b.push({ icon: '💬', label: 'Conversation Starter' });
    if ((stats.reactions || 0) > 40) b.push({ icon: '⚡', label: 'Reaction Giver' });
    if (Store.lvlInfo(u.xp || 0).level >= 3) b.push({ icon: '🏆', label: 'Rising Star' });
    if ((u.badges || []).includes('starter')) b.push({ icon: '✨', label: 'Founding Member' });
    return b.slice(0, 4);
  }

  /* --------------------------- Own profile page --------------------------- */
  function renderProfilePage(root) {
    const u = Store.me();
    const info = Store.lvlInfo(u.xp);
    const quest = Store.questToday();
    const stats = u.stats;
    root.innerHTML = `
      <div class="view-inner" style="max-width:760px;">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="profile-cover" style="--pc-grad:${U.avatarBg(u)}"></div>
          <div class="profile-head">
            ${U.avatar(u, { size: 92, presence: true, ring: true })}
            <div class="grow">
              <h2>${U.esc(u.displayName)}</h2>
              <div class="profile-handle">@${U.esc(u.username)} · joined ${new Date(u.joinedAt).toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
              <div class="badge-row">
                <span class="chip"><span class="chip-dot"></span> ${u.status === 'online' ? 'Online' : u.status}</span>
                ${u.statusMsg ? `<span class="chip">“${U.esc(u.statusMsg)}”</span>` : ''}
              </div>
            </div>
            <button class="btn btn-primary" id="pfEdit">${U.icon('edit', 15)} Edit profile</button>
          </div>
        </div>

        <div class="two-col" style="margin-top:1.1rem;">
          <div class="page-grid">
            <div class="card xp-card">
              <div class="spread"><div><div class="xp-num grad-text">${U.fmtCount(u.xp)} XP</div>
                <div class="small muted">Level ${info.level} Drifter</div></div>
                <div class="streak">🔥 <span>${Store.state.meta.streak.count}-day streak</span></div>
              </div>
              <div class="bar-track" style="margin-top:.7rem;"><div class="bar-fill" style="width:${info.pct}%"></div></div>
              <div class="small faint" style="margin-top:.4rem;">${info.nextLvl - info.cur} XP until level ${info.level + 1} — chat, react and vote to earn more.</div>
            </div>

            <div class="section-label" style="margin-top:.4rem;">${U.icon('trophy', 17)} Achievements</div>
            <div class="achv-grid">
              ${[['💬', 'Conversation Starter', stats.msgs >= 10, stats.msgs + '/10 messages'],
                 ['⚡', 'Reaction Giver', stats.reactionsGiven >= 10, stats.reactionsGiven + '/10 reactions'],
                 ['📊', 'Poll Master', stats.pollsVoted >= 3, stats.pollsVoted + '/3 polls'],
                 ['🎮', 'Player One', stats.gamesPlayed >= 1, stats.gamesPlayed + '/1 activities'],
                 ['🔥', 'Week Warrior', Store.state.meta.streak.count >= 7, Store.state.meta.streak.count + '/7 day streak'],
                 ['✨', 'Founding Member', true, 'season one']]
                .map(([ic, name, got, prog]) => `
                <div class="card achv ${got ? 'got' : ''}">
                  <div class="a-ic">${ic}</div>
                  <div><b style="font-size:.9rem;">${name}</b>
                  <div class="small faint">${got ? 'Unlocked' : prog}</div></div>
                </div>`).join('')}
            </div>
          </div>

          <div class="page-grid">
            <div class="card quest-card">
              <div class="q-ic">${U.icon('zap', 22)}</div>
              <div class="grow">
                <h4>Daily quest</h4>
                <div class="small muted">${quest.label} · +${quest.reward} XP</div>
                <div class="bar-track"><div class="bar-fill" style="width:${quest.progress / quest.goal * 100}%"></div></div>
              </div>
              ${quest.progress >= quest.goal && !quest.claimed
                ? '<button class="btn btn-primary btn-sm" id="claimQuest">Claim!</button>'
                : `<span class="small faint">${quest.progress}/${quest.goal}</span>`}
            </div>
            <div class="card set-row">
              <div class="s-main"><b>Account snapshot</b>
                <p>@${U.esc(u.username)} · ${U.esc(u.email || '')}</p>
                <p>${u.following.length} following · ${u.followers.length} followers</p></div>
              <button class="btn btn-glass btn-sm" id="pfSettings">${U.icon('gear', 15)}</button>
            </div>
          </div>
        </div>
      </div>`;

    root.querySelector('#pfEdit').addEventListener('click', () => Router.go('settings', null, 'profile'));
    root.querySelector('#pfSettings').addEventListener('click', () => Router.go('settings'));
    root.querySelector('#claimQuest')?.addEventListener('click', e => {
      const q = Store.questToday();
      q.claimed = true;
      Store.addXP(q.reward, 'Daily quest complete');
      Store.save();
      UI.confetti(innerWidth / 2, innerHeight * 0.4);
      renderProfilePage(root);
    });
  }

  return { renderPage, renderProfilePage, openProfileCard, acceptSimulatedRequest, isFriend, userMenu, pendingRequests };
})();
