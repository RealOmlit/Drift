/* ==========================================================================
   Zeek · finder.js — global search: command palette (Ctrl/⌘+K) and the
   full search page across rooms, people and messages.
   ========================================================================== */

window.Finder = (() => {
  'use strict';

  const FILTERS = ['all', 'rooms', 'people', 'messages'];
  let st = { q: '', filter: 'all', index: 0, results: [] };
  let paletteEl = null;
  let peopleCache = [];

  /* ============================== indexing ============================== */
  function search(q, filter = 'all') {
    q = q.trim().toLowerCase();
    if (!q) return { rooms: [], people: [], messages: [], topics: [] };
    const match = s => (s || '').toLowerCase().includes(q);

    const rooms = Store.state.rooms.filter(r =>
      r.visibility !== 'private' || Rooms.isJoined(r))
      .filter(r => match(r.name) || match(r.desc) || (r.tags || []).some(match) || match(r.category))
      .slice(0, 6);
    // Directory may still be loading — cache whatever we have.
    const people = peopleCache.filter(u =>
      match(u.username) || match(u.displayName) || match(u.bio)).slice(0, 6);
    const messages = [];
    Store.state.rooms.forEach(r => {
      if (r.visibility === 'private' && !Rooms.isJoined(r)) return;
      r.messages.forEach(m => {
        if (!m.deleted && m.type === 'text' && m.text.toLowerCase().includes(q)) {
          messages.push({ m, room: r });
        }
      });
    });
    messages.sort((a, b) => b.m.ts - a.m.ts);

    return {
      rooms, people,
      messages: messages.slice(0, 8),
      topics: []
    };
  }

  Store.allProfiles?.().then(users => { peopleCache = users; }).catch(() => {});

  function flatten(res, filter) {
    const out = [];
    if ((filter === 'all' || filter === 'rooms') && res.rooms.length)
      res.rooms.forEach(x => out.push({ type: 'room', x }));
    if ((filter === 'all' || filter === 'people') && res.people.length)
      res.people.forEach(x => out.push({ type: 'person', x }));
    if ((filter === 'all' || filter === 'messages') && res.messages.length)
      res.messages.forEach(({ m, room }) => out.push({ type: 'message', x: m, room }));
    return out;
  }

  function openResult(item) {
    closePalette();
    switch (item.type) {
      case 'room': Router.go('room', [item.x.id]); break;
      case 'person': People.openProfileCard(item.x.id); break;
      case 'message': Router.go('room', [item.room.id]); setTimeout(() => Chat.jumpToPublic?.(item.x.id) ?? null, 350); break;
    }
  }

  /* ============================== palette ============================== */
  function openPalette(prefill = '') {
    if (paletteEl) return;
    st = { q: prefill, filter: 'all', index: 0, results: [] };
    paletteEl = U.el('div', { class: 'palette', id: 'paletteRoot' });
    paletteEl.innerHTML = `
      <div class="palette-scrim" data-close></div>
      <div class="palette-box">
        <div class="palette-input-row">
          ${U.icon('search', 19)}
          <input id="palInput" placeholder="Search rooms, people, messages, topics…" autocomplete="off">
          <kbd class="kbd">esc</kbd>
        </div>
        <div class="palette-filters">
          ${FILTERS.map(f => `<button class="chip ${f === 'all' ? 'on' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
        </div>
        <div class="palette-results" id="palResults"></div>
        <div class="pal-foot"><span><kbd class="kbd">↑↓</kbd> navigate</span><span><kbd class="kbd">↵</kbd> open</span><span>Powered by Zeek Search</span></div>
      </div>`;
    document.body.appendChild(paletteEl);
    requestAnimationFrame(() => paletteEl.classList.add('open'));

    const input = paletteEl.querySelector('#palInput');
    input.value = prefill;
    input.focus();

    input.addEventListener('input', U.debounce(() => { st.q = input.value; st.index = 0; draw(); }, 120));
    paletteEl.querySelector('.palette-filters').addEventListener('click', e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      st.filter = b.dataset.f;
      paletteEl.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b));
      st.index = 0; draw();
    });
    paletteEl.querySelector('[data-close]').addEventListener('click', closePalette);
    input.addEventListener('keydown', e => {
      const items = st.results;
      if (e.key === 'ArrowDown') { e.preventDefault(); st.index = Math.min(st.index + 1, items.length - 1); markSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); st.index = Math.max(st.index - 1, 0); markSel(); }
      else if (e.key === 'Enter' && items[st.index]) { openResult(items[st.index]); }
      else if (e.key === 'Escape') closePalette();
    });
    paletteEl.querySelector('#palResults').addEventListener('click', e => {
      const it = e.target.closest('[data-idx]');
      if (it) openResult(st.results[+it.dataset.idx]);
    });
    draw();
  }

  function closePalette() {
    if (!paletteEl) return;
    paletteEl.classList.remove('open');
    const el = paletteEl; paletteEl = null;
    setTimeout(() => el.remove(), 200);
  }

  function resultIcon(t) {
    return { room: 'layers', person: 'user', message: 'message', topic: 'zap' }[t] || 'search';
  }

  function itemHTML(item, i) {
    let title = '', sub = '', lead = '';
    switch (item.type) {
      case 'room': {
        const c = Rooms.catOf(item.x.category);
        lead = `<span class="rc-icon" style="--rc-bg:${c.grad};width:34px;height:34px;border-radius:11px;font-size:1rem;">${item.x.icon}</span>`;
        title = U.esc(item.x.name); sub = `${c.label} · ${U.fmtCount(item.x.memberCount)} members`;
        break;
      }
      case 'person':
        lead = U.avatar(item.x, { size: 32, presence: true });
        title = U.esc(item.x.displayName); sub = `@${U.esc(item.x.username)} · ${U.esc(item.x.statusMsg || '')}`;
        break;
      case 'message': {
        const u = Store.getUser(item.x.userId);
        lead = U.avatar(u || { username: '?' }, { size: 30 });
        title = U.esc(item.x.text.slice(0, 70));
        sub = `${u?.displayName || '?'} in #${U.esc(item.room.name)} · ${U.fmtRel(item.x.ts)}`;
        break;
      }
      case 'topic':
        lead = `<span class="notif-ic" style="color:var(--warn);width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--glass-2);">${U.icon('zap', 16)}</span>`;
        title = `${U.esc(item.x.tag)} <span class="heat" style="color:var(--warn);font-size:.75rem;">🔥 ${item.x.heat}</span>`;
        sub = U.esc(item.x.blurb);
        break;
    }
    return `<button class="pal-item ${i === st.index ? 'sel' : ''}" data-idx="${i}">
      ${lead}<span class="pi-main"><span class="pi-t">${title}</span><span class="pi-s">${sub}</span></span>
      ${U.icon(resultIcon(item.type), 15)}
    </button>`;
  }

  function draw() {
    const box = paletteEl?.querySelector('#palResults'); if (!box) return;
    const res = search(st.q, st.filter);
    st.results = flatten(res, st.filter);
    if (!st.q.trim()) {
      box.innerHTML = `
        <div class="pal-group">Try searching for</div>
        ${['welcome', 'introduce yourself', 'game night', 'music', 'help'].map(s =>
          `<button class="pal-item" data-fill="${s}">${U.icon('search', 14)}<span class="pi-t" style="font-weight:500;color:var(--txt2)">${s}</span></button>`).join('')}`;
      box.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', () => {
        paletteEl.querySelector('#palInput').value = b.dataset.fill;
        st.q = b.dataset.fill; draw();
        paletteEl.querySelector('#palInput').focus();
      }));
      return;
    }
    if (!st.results.length) {
      box.innerHTML = `<div class="empty" style="padding:2rem;"><p>No results for “${U.esc(st.q)}”</p></div>`;
      return;
    }
    let html = '', lastType = '';
    st.results.forEach((item, i) => {
      if (item.type !== lastType) {
        html += `<div class="pal-group">${item.type}s</div>`;
        lastType = item.type;
      }
      html += itemHTML(item, i);
    });
    box.innerHTML = html;
  }

  function markSel() {
    paletteEl?.querySelectorAll('.pal-item[data-idx]').forEach(el =>
      el.classList.toggle('sel', +el.dataset.idx === st.index));
    paletteEl?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
  }

  /* ============================ full search page ============================ */
  function renderSearchPage(root, query = '') {
    const res = search(query);
    root.innerHTML = `
      <div class="view-inner" style="max-width:820px;">
        <div class="view-head">
          <h1>Search</h1>
          <p class="sub">Everything across Zeek — rooms, people, messages and trending topics.</p>
        </div>
        <div class="input-wrap" style="margin-bottom:1rem;">
          ${U.icon('search', 17, 'lead')}
          <input class="input" id="spQ" placeholder="Type to search everything…" value="${U.esc(query)}" style="padding:.85rem .95rem .85rem 2.6rem;font-size:1rem;">
        </div>
        <div id="spOut">${query ? pageResults(query) : '<div class="empty"><p>Start typing — try <b>“study”</b>, <b>“Kai”</b> or <b>#synthwave</b>.</p></div>'}</div>
      </div>`;
    const inp = root.querySelector('#spQ');
    inp.focus();
    inp.addEventListener('input', U.debounce(() => {
      history.replaceState(null, '', '#/search');
      root.querySelector('#spOut').innerHTML = inp.value.trim() ? pageResults(inp.value) :
        '<div class="empty"><p>Start typing…</p></div>';
      bindPageResults(root);
    }, 160));
    bindPageResults(root);
  }

  function pageResults(q) {
    const res = search(q);
    let html = '';
    if (res.rooms.length) html += `<div class="section-label">${U.icon('layers', 16)} Rooms</div><div class="rooms-grid">${res.rooms.map(Rooms.roomCard).join('')}</div>`;
    if (res.people.length) html += `<div class="section-label">${U.icon('users', 16)} People</div><div class="people-grid">${res.people.map(People.personCard).join('')}</div>`;
    if (res.messages.length) html += `<div class="section-label">${U.icon('message', 16)} Messages</div>
      <div class="page-grid">${res.messages.map(({ m, room }) => `
        <button class="card hoverable rs-item" data-goto-msg="${m.id}" data-goto-room="${room.id}" style="text-align:left;width:100%;">
          <div class="rs-m small faint">${Store.getUser(m.userId)?.displayName || '?'} in #${U.esc(room.name)} · ${U.fmtRel(m.ts)}</div>
          <div class="rs-t">${U.esc(m.text.slice(0, 140))}</div>
        </button>`).join('')}</div>`;
    if (res.topics.length) html += `<div class="section-label">${U.icon('zap', 16)} Topics</div>
      <div class="row" style="flex-wrap:wrap;">${res.topics.map(t => `<button class="chip pulse-chip" data-topic-room="${t.room}"><span class="tagc">${U.esc(t.tag)}</span> 🔥 ${t.heat}</button>`).join('')}</div>`;
    if (!html) html = `<div class="empty"><div class="e-icon">${U.icon('search', 24)}</div><h4>No matches</h4><p>Nothing found for “${U.esc(q)}”. Try fewer words.</p></div>`;
    return html;
  }

  function bindPageResults(root) {
    root.querySelectorAll('[data-goto-msg]').forEach(b => b.addEventListener('click', () => {
      Router.go('room', [b.dataset.gotoRoom]);
    }));
    root.querySelectorAll('[data-topic-room]').forEach(b => b.addEventListener('click', () => Router.go('room', [b.dataset.topicRoom])));
  }

  return { openPalette, closePalette, renderSearchPage, search };
})();
