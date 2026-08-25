/* ==========================================================================
   Drift · notifications.js — notification center, bell dropdown, badges.
   In production these arrive via websocket/FCM pushes (see backend.js).
   ========================================================================== */

window.Notifs = (() => {
  'use strict';

  const TYPE_META = {
    mention:       { icon: 'reply',   color: 'var(--ac2)' },
    message:       { icon: 'message', color: 'var(--ac1)' },
    friend:        { icon: 'user-plus', color: 'var(--ok)' },
    invite:        { icon: 'mail',    color: 'var(--warn)' },
    room_activity: { icon: 'activity', color: 'var(--bad)' },
    achievement:   { icon: 'trophy',  color: 'var(--warn)' },
    ai:            { icon: 'sparkles', color: 'var(--ac1)' },
    system:        { icon: 'info',    color: 'var(--txt3)' }
  };

  const list = () => Store.state.notifications;

  function unreadCount() { return list().filter(n => !n.read).length; }

  /**
   * Push a notification. Respects the user's notification preferences and
   * raises a toast + updates any badge in the DOM.
   */
  // [BACKEND] → real pushes arrive here via subscription callbacks
  function push(type, { title, body = '', actorId = null, roomId = null, silent = false } = {}) {
    const prefs = Store.state.settings.notifs;
    if (prefs[type] === false) return null;
    const n = { id: U.uid('n'), type, title, body, actorId, roomId, ts: Date.now(), read: false };
    list().unshift(n);
    if (list().length > 60) list().length = 60;
    Store.save();
    Store.emit('notif:new', n);
    if (!silent) {
      UI.toast({
        title, body, type: 'info', icon: TYPE_META[type]?.icon || 'bell',
        onTap: () => open(n)
      });
    }
    return n;
  }

  /** Route a notification click to the right place. */
  function open(n) {
    n.read = true; Store.save();
    if (n.roomId) Router.go('room', [n.roomId]);
    else if (n.actorId) People.openProfileCard(n.actorId);
    else Router.go('notifs');
  }

  const markAllRead = () => { list().forEach(n => n.read = true); Store.save(); Store.emit('notif:read'); };
  const markRead = id => { const n = list().find(x => x.id === id); if (n) { n.read = true; Store.save(); } };

  /* ------------------------------ dropdown ------------------------------ */
  function renderDropdown(anchor) {
    const items = list().slice(0, 8);
    const html = `
      <div class="spread" style="padding:.35rem .5rem .55rem;">
        <b style="font-family:var(--font-d);font-size:.95rem;">Notifications</b>
        <button class="lnk small" style="color:var(--ac2);font-weight:600;" data-markall>Mark all read</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:.3rem;">
        ${items.length ? items.map(notifCardHTML).join('') : '<div class="empty" style="padding:1.4rem;"><p>All caught up ✨</p></div>'}
      </div>
      <hr style="border:none;border-top:1px solid var(--brd-1);margin:.4rem .2rem;">
      <button data-viewall style="width:100%;text-align:center;padding:.5rem;color:var(--ac2);font-weight:700;font-size:.85rem;">Open notification center</button>`;
    // Reuse pop-menu styling but wider
    UI.closeMenu();
    const m = U.el('div', { class: 'pop-menu', style: 'width:330px;padding:.55rem;' });
    m.innerHTML = html;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    let x = U.clamp(r.right - m.offsetWidth, 10, innerWidth - m.offsetWidth - 10);
    let y = r.bottom + 8;
    if (y + m.offsetHeight > innerHeight - 10) y = Math.max(10, r.top - m.offsetHeight - 8);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    activeMenuRef(m);

    m.addEventListener('click', e => {
      const card = e.target.closest('[data-notif]');
      if (card) { cleanup(); open(list().find(n => n.id === card.dataset.notif)); return; }
      if (e.target.closest('[data-markall]')) { markAllRead(); refreshBadges(); cleanup(); return; }
      if (e.target.closest('[data-viewall]')) { cleanup(); Router.go('notifs'); }
    });

    const onDoc = e => { if (!m.contains(e.target)) cleanup(); };
    const onEsc = e => { if (e.key === 'Escape') cleanup(); };
    let dead = false;
    function cleanup() {
      if (dead) return; dead = true;
      m.remove();
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onEsc);
    }
    setTimeout(() => {
      document.addEventListener('click', onDoc);
      document.addEventListener('keydown', onEsc);
    });
  }

  /* ------------------------------ cards ------------------------------ */
  function notifCardHTML(n) {
    const meta = TYPE_META[n.type] || TYPE_META.system;
    const actor = n.actorId ? Store.getUser(n.actorId) : null;
    return `
      <button class="notif-card ${n.read ? '' : 'unread'}" data-notif="${n.id}" style="border:none;background:transparent;width:100%;">
        ${actor ? U.avatar(actor, { size: 38 }) : `<span class="notif-ic" style="color:${meta.color}">${U.icon(meta.icon, 18)}</span>`}
        <span class="notif-main grow">
          <b>${U.esc(n.title)}</b><p>${U.esc(n.body)}</p>
        </span>
        <span class="notif-time">${U.fmtRel(n.ts)}</span>
        ${n.read ? '' : '<span class="notif-dot"></span>'}
      </button>`;
  }

  /* --------------------------- full page view --------------------------- */
  function renderPage(root) {
    root.innerHTML = `
      <div class="view-inner">
        <div class="view-head spread">
          <div><h1>Notifications</h1><p class="sub">${unreadCount() ? `${unreadCount()} unread` : 'You\'re all caught up'}</p></div>
          <button class="btn btn-glass btn-sm" data-markall>${U.icon('checks', 16)} Mark all read</button>
        </div>
        <div class="notif-list" id="notifList"></div>
      </div>`;
    drawList();
    root.querySelector('[data-markall]').addEventListener('click', () => { markAllRead(); drawList(); refreshBadges(); });
  }

  function drawList() {
    const wrap = U.$('#notifList'); if (!wrap) return;
    const items = list();
    if (!items.length) {
      wrap.innerHTML = `<div class="empty"><div class="e-icon">${U.icon('bell', 26)}</div>
        <h4>Nothing yet</h4><p>Mentions, friend requests and room activity will land here.</p></div>`;
      return;
    }
    let html = '', lastDay = '';
    items.forEach(n => {
      const day = U.fmtDayDivider(n.ts);
      if (day !== lastDay) { html += `<div class="day-sep">${day}</div>`; lastDay = day; }
      html += notifCardHTML(n);
    });
    wrap.innerHTML = html;
    wrap.onclick = e => {
      const card = e.target.closest('[data-notif]');
      if (card) open(list().find(n => n.id === card.dataset.notif)), drawList(), refreshBadges();
    };
  }

  /** Update every badge element bound to unread count. */
  function refreshBadges() {
    const c = unreadCount();
    U.$$('[data-notif-badge]').forEach(b => {
      b.textContent = c > 99 ? '99+' : c;
      b.style.display = c ? '' : 'none';
    });
  }

  return { push, open, markAllRead, markRead, unreadCount, renderPage, renderDropdown, refreshBadges, TYPE_META };
})();
