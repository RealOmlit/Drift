/* ==========================================================================
   Drift · people.js — real people directory, follows and profile cards.
   Data comes from public.profiles / follows / presence. No demo users.
   ========================================================================== */

window.People = (() => {
  'use strict';

  const state = { tab: 'all', q: '', loaded: false, users: [] };
  const isFriend = id => Store.me()?.following.includes(id) && Store.me().followers.includes(id);
  const isOnline = id => Backend.onlineUserIds().includes(id);
  const isFollowing = id => !!Store.me()?.following.includes(id);

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
            ${['friends', 'online', 'all'].map(t =>
              `<button data-t="${t}" class="${state.tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
          </div>
        </div>

        <div id="ppSuggest"></div>

        <div id="ppGrid"><div class="view-inner">${UI.skeletonCards(6)}</div></div>
      </div>`;

    U.$('#ppSearch').addEventListener('input', U.debounce(e => { state.q = e.target.value.toLowerCase(); drawGrid(); }, 140));
    U.$('#ppTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      state.tab = b.dataset.t;
      U.$$('#ppTabs button').forEach(x => x.classList.toggle('on', x === b));
      drawGrid();
    });

    loadDirectory().then(() => { drawSuggestions(); drawGrid(); }).catch(err =>
      U.$('#ppGrid').innerHTML = emptyHTML('Couldn\u2019t load people', err.message));

    Store.on('presence', () => { if (U.$('#ppGrid')) { drawSuggestions(); drawGrid(); } });
    Store.on('profile:loaded', () => { if (U.$('#ppGrid')) drawGrid(); });
  }

  /** "Suggested for you" — people who share your rooms, that you don't follow yet. */
  function drawSuggestions() {
    const box = U.$('#ppSuggest'); if (!box) return;
    const me = Store.me();
    const onlineIds = new Set(Backend.onlineUserIds());
    const candidates = state.users
      .filter(x => x.id !== me.id && !isFollowing(x.id) && !Mod.isBlocked(x.id))
      .map(x => {
        let score = 0;
        Store.state.rooms.forEach(r => {
          if (r.members.includes(x.id)) score += r.members.includes(me.id) ? 3 : 1;
        });
        if (onlineIds.has(x.id)) score += 1;
        return { u: x, score };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (!candidates.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="section-label">${U.icon('sparkles', 16)} Suggested for you</div>
      <div class="suggest-strip">
        ${candidates.map(({ u }) => `
          <div class="suggest-card card">
            <button data-user-card="${u.id}" style="background:none;border:none;padding:0;">${U.avatar(u, { size: 52, presence: true, ring: true })}</button>
            <b>${U.esc(u.displayName)}</b>
            <span class="small faint">@${U.esc(u.username)}</span>
            <button class="btn btn-primary btn-sm" data-sug-follow="${u.id}">${U.icon('user-plus', 13)} Follow</button>
          </div>`).join('')}
      </div>`;

    box.querySelectorAll('[data-sug-follow]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Following…';
      try {
        await Store.setFollow(b.dataset.sugFollow, true);
        UI.toast({ title: 'Following ✦', body: `${Store.getUser(b.dataset.sugFollow)?.displayName} was notified`, type: 'ok', icon: 'user-plus' });
        drawSuggestions();
      } catch (err) {
        b.disabled = false;
        UI.toast({ title: 'Couldn\u2019t follow', body: err.message, type: 'bad' });
      }
    }));
  }

  async function loadDirectory() {
    if (state.loaded) return;
    state.users = await Store.allProfiles();
    state.loaded = true;
  }

  function filteredUsers() {
    let users = [...state.users];
    if (state.tab === 'friends') users = users.filter(u => Store.me().followers.includes(u.id));
    else if (state.tab === 'online') users = users.filter(u => isOnline(u.id));
    if (state.q) users = users.filter(u =>
      u.username.toLowerCase().includes(state.q) ||
      u.displayName.toLowerCase().includes(state.q) ||
      (u.bio || '').toLowerCase().includes(state.q));
    // Friends first, then online, then rest
    return users.sort((a, b) =>
      (Store.me().followers.includes(b.id) - Store.me().followers.includes(a.id)) ||
      (isOnline(b.id) - isOnline(a.id)));
  }

  function personCard(u) {
    const friend = isFriend(u.id);
    const following = isFollowing(u.id);
    const mutual = mutualRooms(u).length;
    const _status = (window.Backend?.getStatus ? Backend.getStatus(u.id) : (isOnline(u.id) ? (u.status || 'online') : 'offline'));
    const online = _status !== 'offline';
    const dotCls = _status === 'away' ? 'away' : _status === 'online' ? 'online' : 'offline';
    // Ensure avatar dot reflects actual presence status
    u.status = _status;
    return `
      <article class="card card-glow hoverable person-card" data-open-user="${u.id}">
        ${U.avatar(u, { size: 62, presence: true, ring: true })}
        <div class="p-name">${U.esc(u.displayName)}
          ${online ? `<span class="dot ${dotCls}"></span>` : ''}
        </div>
        <div class="small faint">@${U.esc(u.username)}</div>
        <div class="p-status">${U.esc(u.statusMsg || '')}</div>
        <div class="small faint">${_status === 'online' ? 'online now' : _status === 'away' ? 'away' : u.lastSeen ? 'last seen ' + U.fmtRel(u.lastSeen) : mutual + ' shared room' + (mutual === 1 ? '' : 's')}</div>
        <div class="p-actions">
          ${following
            ? `<button class="btn btn-glass btn-sm" data-act="unfollow" data-u="${u.id}">Following ✓</button>`
            : `<button class="btn btn-primary btn-sm" data-act="follow" data-u="${u.id}">${U.icon('user-plus', 14)} Follow</button>`}
          <button class="icon-btn sm" data-act="menu" data-u="${u.id}" aria-label="More">${U.icon('dots', 15)}</button>
        </div>
      </article>`;
  }

  function drawGrid() {
    const grid = U.$('#ppGrid'); if (!grid) return;
    const users = filteredUsers();
    grid.innerHTML = users.length
      ? `<div class="people-grid">${users.map(personCard).join('')}</div>`
      : emptyHTML(
          state.tab === 'friends' ? 'No friends yet' : state.tab === 'online' ? 'Nobody online' : 'Nobody found',
          state.tab === 'friends'
            ? 'Follow people to build your orbit — they\u2019ll show up here.'
            : 'Try a different search or switch tabs.');
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

  async function handleAction(act, uid) {
    switch (act) {
      case 'follow': {
        try {
          await Store.setFollow(uid, true);
          if (!Store.me().following.includes(uid)) Store.me().following.push(uid);
          UI.toast({ title: 'Following ✦', body: `${Store.getUser(uid)?.displayName} was notified`, type: 'ok', icon: 'user-plus' });
        } catch (e) {
          UI.toast({ title: 'Couldn\u2019t follow', body: e.message, type: 'bad', icon: 'alert' });
        }
        break;
      }
      case 'unfollow': {
        try {
          await Store.setFollow(uid, false);
          Store.me().following = Store.me().following.filter(f => f !== uid);
          UI.toast({ title: 'Unfollowed', type: 'info', icon: 'x' });
        } catch (e) {
          UI.toast({ title: 'Couldn\u2019t unfollow', body: e.message, type: 'bad', icon: 'alert' });
        }
        break;
      }
    }
    drawGrid();
  }

  function userMenu(anchor, uid) {
    const u = Store.getUser(uid);
    const blocked = Mod.isBlocked(uid), muted = Mod.isMuted(uid);
    UI.menu(anchor, [
      { label: 'View profile', icon: 'user', onClick: () => openProfileCard(uid) },
      ...(isFollowing(uid)
        ? [{ label: 'Unfollow', icon: 'x', onClick: () => handleAction('unfollow', uid) }]
        : [{ label: 'Follow', icon: 'user-plus', onClick: () => handleAction('follow', uid) }]),
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
    const _status = self ? (u.status || 'online') : (window.Backend?.getStatus ? Backend.getStatus(userId) : (isOnline(userId) ? 'online' : 'offline'));
    const online = _status !== 'offline';
    u.status = _status;

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
            <span class="level-ring">${U.avatar(u, { size: 84, presence: online })}</span>
            ${self ? '<button class="btn btn-glass btn-sm" data-edit>Edit</button>' : ''}
          </div>
          <div class="pc-name">${U.esc(u.displayName)}
            ${badgeList(u).map(b => `<span title="${b.label}">${b.icon}</span>`).join('')}
          </div>
          <div class="pc-handle">@${U.esc(u.username)} · Level ${info.level}</div>
          ${u.statusMsg ? `<div class="pc-bio">"${U.esc(u.statusMsg)}"</div>` : ''}
          ${u.bio ? `<div class="pc-bio">${U.esc(u.bio)}</div>` : ''}
          <div class="small faint" style="margin-top:.35rem;">
            ${_status === 'online' ? 'Online now' : _status === 'away' ? 'Away' : u.lastSeen ? 'Last seen ' + U.fmtRel(u.lastSeen) : 'Offline'}
          </div>

          <div class="pc-level">
            <div class="spread small"><span class="muted">Community XP</span><b>${U.fmtCount(info.cur)} XP</b></div>
            <div class="lv-bar"><div class="lv-fill" style="width:${info.pct}%"></div></div>
            <div class="small faint" style="margin-top:.25rem;">${info.nextLvl - info.cur} XP to level ${info.level + 1}</div>
          </div>

          <div class="pc-stats">
            ${self ? `
              <div class="pc-stat"><b>${U.fmtCount(u.stats.msgs)}</b><span>Messages</span></div>
              <div class="pc-stat"><b>${U.fmtCount(u.stats.reactionsGiven)}</b><span>Reactions</span></div>` : `
              <div class="pc-stat"><b>${mutualRooms(u).length}</b><span>Shared rooms</span></div>
              <div class="pc-stat"><b>${Math.max(1, Math.round((Date.now() - u.joinedAt) / 864e5))}</b><span>Days here</span></div>`}
            <div class="pc-stat"><b>${Math.max(1, Math.round((Date.now() - u.joinedAt) / 864e5))}</b><span>Days here</span></div>
          </div>

          ${!self ? `
          <div class="row" style="margin-top:1rem;">
            ${isFollowing(userId)
              ? '<button class="btn btn-glass grow" data-unfollow>Following ✓</button>'
              : '<button class="btn btn-primary grow" data-follow>' + U.icon('user-plus', 16) + ' Follow</button>'}
            <button class="icon-btn" data-menu aria-label="More">${U.icon('dots')}</button>
          </div>` : ''}
        </div>`
    });

    const card = m.card;
    card.querySelector('[data-edit]')?.addEventListener('click', () => { m.close(); Router.go('settings', null, 'profile'); });
    card.querySelector('[data-follow]')?.addEventListener('click', async e => {
      await handleAction('follow', userId);
      e.currentTarget.outerHTML = '<button class="btn btn-glass grow">Following ✓</button>';
    });
    card.querySelector('[data-unfollow]')?.addEventListener('click', async () => { await handleAction('unfollow', userId); m.close(); });
    card.querySelector('[data-menu]')?.addEventListener('click', e => userMenu(e.currentTarget, userId));
  }

  /** Badges are earned, never invented: derived from real activity. */
  function badgeList(u) {
    const b = [];
    const days = Math.round((Date.now() - u.joinedAt) / 864e5);
    if (days < 14) b.push({ icon: '🌱', label: 'New Drifter' });
    if ((u.stats?.msgs || 0) >= 10) b.push({ icon: '💬', label: 'Conversation Starter' });
    if ((u.stats?.reactionsGiven || 0) >= 10) b.push({ icon: '⚡', label: 'Reaction Giver' });
    if (Store.lvlInfo(u.xp || 0).level >= 3) b.push({ icon: '🏆', label: 'Rising Star' });
    return b.slice(0, 4);
  }

  /* --------------------------- Own profile page --------------------------- */
  function renderProfilePage(root) {
    const u = Store.me();
    const info = Store.lvlInfo(u.xp);
    const quest = Store.questToday();
    const stats = u.stats;
    const streak = u.streak?.count || 0;
    root.innerHTML = `
      <div class="view-inner" style="max-width:760px;">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="profile-cover" style="--pc-grad:${U.avatarBg(u)}"></div>
          <div class="profile-head">
            <span style="position:relative;">
              ${U.avatar(u, { size: 92, presence: true, ring: true })}
              <button class="icon-btn sm" id="pfPhoto" title="Change profile photo"
                style="position:absolute;bottom:-4px;right:-4px;background:var(--grad);color:#fff;border:2px solid var(--bg1);">
                ${U.icon('image', 14)}
              </button>
              <input type="file" id="pfPhotoFile" accept="image/jpeg,image/png,image/webp" hidden>
            </span>
            <div class="grow">
              <h2>${U.esc(u.displayName)}</h2>
              <div class="profile-handle">@${U.esc(u.username)} · joined ${new Date(u.joinedAt).toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
              <div class="badge-row">
                <span class="chip"><span class="chip-dot" style="background:${u.status === 'away' ? 'var(--warn)' : u.status === 'offline' ? 'var(--txt3)' : 'var(--ok)'}"></span> ${u.status === 'away' ? 'Away' : u.status === 'offline' ? 'Offline' : 'Online'}</span>
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
                ${streak > 1 ? `<div class="streak">🔥 <span>${streak}-day streak</span></div>` : ''}
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
                 ['🔥', 'Week Warrior', streak >= 7, streak + '/7 day streak'],
                 ['🤝', 'Social Butterfly', u.following.length >= 3, u.following.length + '/3 follows']]
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

    // Custom profile photo — safety-checked, then stored in Supabase Storage.
    const photoBtn = root.querySelector('#pfPhoto');
    if (photoBtn) {
      photoBtn.addEventListener('click', () => root.querySelector('#pfPhotoFile').click());
      root.querySelector('#pfPhotoFile').addEventListener('change', async e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        photoBtn.disabled = true;
        try {
          UI.toast({ title: 'Checking photo…', body: 'Running it through safety verification.', type: 'info', duration: 2200 });
          const verdict = await ImageGuard.check(f);
          if (!verdict.ok) throw new Error('That photo didn\u2019t pass the safety check.');
          const blob = await ImageGuard.compress(f, 256, 0.85);
          const path = `${Store.me().id}/pfp.jpg`;
          const up = await SB.client.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
          if (up.error) throw up.error;
          const url = SB.client.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
          await SB.unwrap(SB.client.from('profiles').update({ avatar_url: url.split('?')[0], avatar_emoji: '' }).eq('id', Store.me().id));
          Store.me().avatarUrl = url;
          Store.me().avatarEmoji = '';
          Store.state.profile.avatarUrl = url;
          Store.state.profile.avatarEmoji = '';
          Store.touchProfile();
          window.AppShell?.refreshIdentity?.();
          renderProfilePage(root);
          UI.toast({ title: 'Photo updated ✨', body: 'Your new look is live everywhere.', type: 'ok', icon: 'check' });
        } catch (err) {
          UI.toast({ title: 'Couldn\u2019t update photo', body: /bucket|not found|policy|row-level/i.test(err.message || '')
            ? 'Photo storage isn\u2019t set up yet — run supabase-setup-images.sql in your Supabase SQL editor (see SETUP.md).'
            : err.message, type: 'bad', icon: 'alert', duration: 7000 });
        } finally {
          photoBtn.disabled = false;
        }
      });
    }
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

  return { renderPage, renderProfilePage, openProfileCard, isFriend, userMenu };
})();
