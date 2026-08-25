/* ==========================================================================
   Drift · app.js — application shell: rail, mobile chrome, router,
   shortcuts, onboarding tour, global event wiring. Bootstrap happens at
   the bottom (DOMContentLoaded).
   ========================================================================== */

window.Router = (() => {
  'use strict';
  let current = { name: null, params: [] };
  let rendering = false;

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, ...params] = h.split('/').filter(Boolean);
    return { name: name || 'home', params };
  }

  /** go('room', ['r2']) or go('settings', null, 'profile') */
  function go(name, params = [], sub = null) {
    if (rendering) return;
    current = { name, params, sub };
    const hash = '#/' + [name, ...params].filter(Boolean).join('/');
    if (location.hash !== hash) {
      rendering = true;
      location.hash = hash;
      setTimeout(() => { rendering = false; });
    }
    render();
    window.AppShell?.syncNav(name);
  }

  function handleHashChange() {
    if (rendering) return;
    const { name, params } = parseHash();
    current = { name, params };
    render();
    window.AppShell?.syncNav(name);
  }

  function render() {
    const view = U.$('#view');
    if (!view) return;
    Chat.unmount();
    UI.closeMenu();
    closePaletteIfOpen();
    scrollTo(0, 0);

    switch (current.name) {
      case 'home':      return paint(view, root => AppShell.renderHome(root));
      case 'discover':  return paint(view, root => Rooms.renderDiscoverPage(root));
      case 'rooms':     return paint(view, root => Rooms.renderMyRoomsPage(root));
      case 'people':    return paint(view, root => People.renderPage(root));
      case 'notifs':    return paint(view, root => Notifs.renderPage(root), () => Notifs.refreshBadges());
      case 'zephyr':    return paint(view, root => AI.renderPanel(root));
      case 'profile':   return paint(view, root => People.renderProfilePage(root));
      case 'search':    return paint(view, root => Finder.renderSearchPage(root));
      case 'settings':  return paint(view, root => SettingsPage.render(root, current.sub));
      case 'room': {
        // Room views are instant (no skeleton) — chat should feel immediate
        AppShell.setRailActive('rooms');
        Chat.mount(view, current.params[0]);
        return;
      }
      default:          return paint(view, root => AppShell.renderHome(root));
    }

    function paint(root, fn, after) {
      // Brief skeleton for content-heavy pages → perceived speed
      root.innerHTML = `<div class="view-inner">${UI.skeletonCards(6)}</div>`;
      setTimeout(() => {
        if (!root.isConnected) return;
        fn(root);
        after && after();
      }, 160);
    }
  }

  function closePaletteIfOpen() { try { Finder.closePalette(); } catch (e) {} }

  window.addEventListener('hashchange', handleHashChange);

  return {
    go, get current() { return current; },
    boot() {
      const { name, params } = parseHash();
      current = { name: VIEWS_OK.has(name) ? name : 'home', params };
      render();
      AppShell.syncNav(current.name);
    }
  };
})();

const VIEWS_OK = new Set(['home', 'discover', 'rooms', 'people', 'notifs', 'zephyr', 'profile', 'search', 'settings', 'room']);

/* ====================================================================== */
window.AppShell = (() => {
  'use strict';

  /* ------------------------------ HOME ------------------------------ */
  function renderHome(root) {
    const u = Store.me();
    const info = Store.lvlInfo(u.xp);
    const quest = Store.questToday();

    // "Continue chatting": joined rooms sorted by latest activity
    const recent = Store.state.rooms
      .filter(r => r.members.includes('me'))
      .sort((a, b) => lastActivity(b) - lastActivity(a)).slice(0, 5);
    const trending = [...Store.state.rooms]
      .filter(r => r.visibility === 'public' || r.members.includes('me'))
      .sort((a, b) => b.momentum - a.momentum).slice(0, 4);
    const friendsOnline = DemoData.users.filter(x => u.followers.includes(x.id) && x.status !== 'offline').slice(0, 8);
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Night owl hours' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    root.innerHTML = `
      <div class="view-inner">
        <div class="home-hero">
          <div class="home-hello">
            <h1>${greet}, <span>${U.esc(u.displayName.split(' ')[0])}</span>
              ${Store.state.meta.streak.count > 1 ? `<span class="streak">🔥 ${Store.state.meta.streak.count}-day streak</span>` : ''}
            </h1>
            <p class="sub muted">${quest.progress >= quest.goal && !quest.claimed ? 'Your daily quest is complete — claim it below!' : quest.label} · Level ${info.level}</p>
          </div>
          <button class="btn btn-primary" data-go="zephyr">✨ Ask Zephyr</button>
        </div>

        <!-- Quick Pulse -->
        <div class="pulse-ticker">
          <div class="pulse-track" id="pulseTrack"></div>
        </div>

        <div class="dash-stats" style="margin-top:1rem;">
          ${statCard('activity', '<b data-online-count>—</b><span>drifters online</span>')}
          ${statCard('layers', `<b>${Store.state.rooms.filter(r => r.members.includes('me')).length}</b><span>your rooms</span>`)}
          ${statCard('zap', `<b>${U.fmtCount(u.xp)}</b><span>community XP</span>`)}
          ${statCard('flame', `<b>${trending[0]?.momentum || 0}</b><span>top momentum</span>`)}
        </div>

        <div class="section-label">${U.icon('clock', 17)} Continue chatting</div>
        <div class="room-row-scroll">${recent.map(r => Rooms.miniRoomCard(r)).join('')}</div>

        <div class="two-col">
          <div>
            <div class="section-label">${U.icon('flame', 17)} Trending rooms</div>
            <div class="page-grid">${trending.map(r => Rooms.roomCard(r)).join('')}</div>
          </div>
          <div>
            <div class="section-label">${U.icon('users', 17)} Friends in orbit</div>
            <div class="card" style="padding:1rem;">
              ${friendsOnline.length
                ? `<div class="friends-strip">${friendsOnline.map(f => `
                    <div class="friend-bubble" data-user-card="${f.id}">
                      ${U.avatar(f, { size: 46, presence: true })}
                      <span class="fb-name">${U.esc(f.displayName)}</span>
                    </div>`).join('')}</div>`
                : '<p class="small muted">Connect with people from the People page to see them here.</p>'}
              <button class="btn btn-glass btn-sm btn-block" style="margin-top:.7rem;" data-go="people">Find people</button>
            </div>

            <div class="card quest-card" style="margin-top:1rem;">
              <div class="q-ic">${U.icon('zap', 22)}</div>
              <div class="grow">
                <h4>Daily quest</h4>
                <div class="small muted">${quest.label} · +${quest.reward} XP</div>
                <div class="bar-track"><div class="bar-fill" style="width:${quest.progress / quest.goal * 100}%"></div></div>
              </div>
              ${quest.claimed ? '<span class="badge badge-new">Done ✓</span>'
                : quest.progress >= quest.goal ? '<button class="btn btn-primary btn-sm" id="homeClaim">Claim!</button>'
                : `<span class="small faint">${quest.progress}/${quest.goal}</span>`}
            </div>

            <div class="card card-glow lit" style="margin-top:1rem;">
              <div class="row" style="gap:.7rem;">
                <div class="ai-av" style="width:38px;height:38px;">✨</div>
                <div><b class="small" style="font-family:var(--font-d)">Zephyr's tip</b>
                <p class="small muted">Try “summarize this room” inside a busy channel — I'll catch you up in seconds.</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Quick Pulse ticker (doubled for seamless marquee)
    const chips = DemoData.TOPICS.map(t =>
      `<button class="pulse-chip" data-topic-room="${t.room}" title="${U.esc(t.blurb)}">
        <span class="tagc">${U.esc(t.tag)}</span><span class="heat">🔥${t.heat}</span>
      </button>`).join('');
    U.$('#pulseTrack').innerHTML = chips + chips;
    U.$$('#pulseTrack .pulse-chip').forEach(c => c.addEventListener('click', () => Router.go('room', [c.dataset.topicRoom])));
    U.$('#homeClaim')?.addEventListener('click', e => {
      const q = Store.questToday(); q.claimed = true; Store.addXP(q.reward, 'Daily quest'); Store.save();
      UI.confetti(innerWidth / 2, innerHeight * .4); renderHome(root);
    });

    bindGoButtons(root);
  }

  const statCard = (ic, html) => `<div class="card stat-card"><div class="stat-ic">${U.icon(ic, 20)}</div><div>${html}</div></div>`;
  const lastActivity = r => r.messages.length ? r.messages[r.messages.length - 1].ts : r.createdAt;

  function bindGoButtons(root) {
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => Router.go(b.dataset.go)));
  }

  /* --------------------------- Shell & wiring --------------------------- */
  /** Fill the static shell buttons (in HTML) with icons & labels. */
  function injectChrome() {
    const ICON_MAP = { home: 'home', discover: 'compass', rooms: 'layers', people: 'users', zephyr: 'sparkles' };
    // Rail
    U.$$('#railNav [data-view]').forEach(b =>
      b.insertAdjacentHTML('afterbegin', U.icon(ICON_MAP[b.dataset.view], 22)));
    U.$('#railNav #bellBtn').insertAdjacentHTML('afterbegin', U.icon('bell', 21));
    U.$$('.rail [data-view="settings"]').forEach(b => b.insertAdjacentHTML('afterbegin', U.icon('gear', 21)));
    // Bottom nav (icon + tiny label)
    U.$$('#bottomNav .bn-item').forEach(b => {
      const ic = ICON_MAP[b.dataset.view];
      const label = { home: 'Home', discover: 'Discover', rooms: 'Rooms', people: 'People', zephyr: 'Zephyr' }[b.dataset.view];
      b.insertAdjacentHTML('afterbegin', `${U.icon(ic, 21)}<span>${label}</span>`);
    });
    // Mobile top bar
    U.$('#mobSearchBtn')?.insertAdjacentHTML('afterbegin', U.icon('search', 19));
    U.$('#mobBell')?.insertAdjacentHTML('afterbegin', U.icon('bell', 19));
  }

  function setRailActive(name) {
    const map = { room: 'rooms', search: 'discover' };
    const active = map[name] || name;
    U.$$('#railNav [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === active));
    U.$$('#bottomNav [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === active));
  }
  const syncNav = setRailActive;

  function refreshIdentity() {
    const u = Store.me(); if (!u) return;
    const slot = U.$('#railAvatar');
    if (slot) slot.innerHTML = U.avatar(u, { size: 36 });
    const mob = U.$('#mobAvatar');
    if (mob) mob.innerHTML = U.avatar(u, { size: 32 });
  }

  function avatarMenu(anchor) {
    const u = Store.me();
    UI.menu(anchor, [
      { header: true, label: `@${u.username}` },
      { label: 'My profile', icon: 'user', onClick: () => Router.go('profile') },
      { label: 'Settings', icon: 'gear', onClick: () => Router.go('settings') },
      { sepBefore: true },
      { label: 'Toggle theme', icon: S().theme === 'dark' ? 'sun' : 'moon', onClick: toggleTheme },
      { label: 'Log out', icon: 'logout', danger: true, onClick: () => Auth.signOut() }
    ]);
  }
  const S = () => Store.state.settings;
  function toggleTheme() { S().theme = S().theme === 'dark' ? 'light' : 'dark'; SettingsPage.applyTheme(); Store.save(); }

  function wireShell() {
    // Rail navigation
    U.$$('#railNav [data-view], #bottomNav [data-view]').forEach(b =>
      b.addEventListener('click', () => Router.go(b.dataset.view)));

    // Bell dropdowns + badges
    ['#bellBtn', '#mobBell'].forEach(sel => U.$(sel)?.addEventListener('click', e => {
      e.stopPropagation();
      Notifs.renderDropdown(e.currentTarget);
    }));

    // Avatars
    U.$('#railAvatarBtn')?.addEventListener('click', e => avatarMenu(e.currentTarget));
    U.$('#mobAvatarBtn')?.addEventListener('click', e => avatarMenu(e.currentTarget));

    // Mobile top bar
    U.$('#mobSearchBtn')?.addEventListener('click', () => Finder.openPalette());

    // Global events
    Store.on('presence', n => {
      U.$$('[data-online-count]').forEach(el => el.textContent = U.fmtCount(n));
    });
    Store.on('xp', ({ amount, reason }) => {
      UI.toast({ title: `+${amount} XP`, body: reason, type: 'xp', icon: 'zap', duration: 2400 });
    });
    Store.on('levelup', info => {
      UI.confetti(innerWidth / 2, innerHeight * .3);
      UI.toast({ title: `Level ${info.level} reached! 🏆`, body: 'Your gradient aura intensifies.', type: 'xp', icon: 'trophy', duration: 5200 });
      refreshIdentity();
    });
    Store.on('notif:new', () => Notifs.refreshBadges());
    Store.on('msg:new', msg => {
      // Unread dots on the rooms nav when the message isn't on screen
      if (Router.current.name === 'room' && Router.current.params[0] === msg.roomId) return;
      if (msg.userId === 'me' || !Store.me()?.reads) return;
      refreshUnreadBadges();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); Finder.openPalette(); }
      else if (e.key === '/' && !typing && !UI.anyModalOpen()) { e.preventDefault(); Finder.openPalette(); }
      else if (e.key === 'Escape') { if (UI.anyModalOpen()) UI.closeModal(); }
    });

    // Delegated profile-card opener (works everywhere)
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-user-card]');
      if (t && !t.closest('.pop-menu')) People.openProfileCard(t.dataset.userCard);
    });

    // First-visit tour
    if (!Store.state.meta.onboarded) setTimeout(startTour, 900);

    refreshUnreadBadges();
    Notifs.refreshBadges();
    refreshIdentity();
  }

  function refreshUnreadBadges() {
    const meP = Store.me(); if (!meP?.reads) return;
    let total = 0;
    Store.state.rooms.forEach(r => {
      if (!r.members.includes('me')) return;
      const since = meP.reads[r.id] || 0;
      total += r.messages.filter(m => m.userId !== 'me' && m.ts > since && !m.deleted && m.type !== 'system').length;
    });
    const badge = U.$('#railRoomsBadge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = total ? '' : 'none';
    }
    const bn = U.$('#bnRoomsBadge');
    if (bn) { bn.textContent = total; bn.style.display = total ? '' : 'none'; }
  }

  /* ------------------------------ Tour ------------------------------ */
  function startTour() {
    const steps = [
      { sel: innerWidth > 900 ? '[data-view="discover"]' : '#bottomNav [data-view="discover"]', title: '🔎 Discover rooms', text: 'Browse communities by vibe — gaming, coding, study and more. Or create your own in seconds.' },
      { sel: innerWidth > 900 ? '[data-view="zephyr"]' : '#bottomNav [data-view="zephyr"]', title: '✨ Meet Zephyr', text: 'Your built-in AI companion. Summaries, icebreakers, translations — right inside Drift.' },
      { sel: innerWidth > 900 ? '#bellBtn' : '#mobBell', title: '🔔 Notifications live here', text: 'Mentions, friend requests and trending rooms land here — with toasts so you never miss a beat.' },
      { sel: null, title: "That's the spirit ✨", text: 'Jump into Orbit Lounge to feel the flow. You can replay this tour anytime from Settings → Profile… actually, just enjoy!' }
    ];
    let i = 0;
    const scrimRoot = U.$('#tour-root');
    function draw() {
      const step = steps[i];
      const target = step.sel ? U.$(step.sel) : null;
      const rect = target?.getBoundingClientRect();
      scrimRoot.innerHTML = `
        ${rect ? `<div class="tour-hole" style="left:${rect.left - 8}px;top:${rect.top - 8}px;width:${rect.width + 16}px;height:${rect.height + 16}px;"></div>` : ''}
        <div class="tour-card" style="${cardPos(rect)}">
          <h4>${U.icon('sparkles', 16)} ${step.title}</h4><p>${step.text}</p>
          <div class="spread">
            <span class="small faint">${i + 1}/${steps.length}</span>
            <span class="row">
              <button class="btn btn-glass btn-sm" data-skip>Skip</button>
              <button class="btn btn-primary btn-sm" data-next>${i === steps.length - 1 ? 'Finish' : 'Next'}</button>
            </span>
          </div>
        </div>`;
      scrimRoot.querySelector('[data-skip]').addEventListener('click', end);
      scrimRoot.querySelector('[data-next]').addEventListener('click', () => { i++; i < steps.length ? draw() : end(); });
    }
    function cardPos(rect) {
      if (!rect) return 'left:50%;top:50%;transform:translate(-50%,-50%);';
      const top = Math.min(rect.bottom + 14, innerHeight - 190);
      const left = U.clamp(rect.left - 40, 12, innerWidth - 320);
      return `left:${left}px;top:${top}px;`;
    }
    function end() {
      scrimRoot.innerHTML = '';
      Store.state.meta.onboarded = true;
      Store.save();
    }
    draw();
  }

  /* ------------------------------ Boot ------------------------------ */
  function boot() {
    Store.init();               // must run first so Auth.restore() can see accounts
    if (!Auth.requireAuth()) return;
    SettingsPage.applyTheme();
    Backend.start();
    injectChrome();
    wireShell();
    Router.boot();

    // Welcome mat
    setTimeout(() => {
      const q = Store.questToday();
      UI.toast({
        title: `Welcome back, ${Store.me().displayName} ✦`,
        body: `${Notifs.unreadCount()} notifications · Daily quest: ${q.label}`,
        icon: 'sparkles', type: 'info', duration: 6000,
        onTap: () => Notifs.refreshBadges()
      });
    }, 1200);
  }

  return { boot, setRailActive, syncNav, refreshIdentity, refreshUnreadBadges, startTour, renderHome };
})();

document.addEventListener('DOMContentLoaded', AppShell.boot);
