/* ==========================================================================
   Drift · ui.js — toasts, modals, menus, emoji picker, sounds, confetti,
   skeletons and small shared UI behaviors. Exposed as `UI`.
   ========================================================================== */

window.UI = (() => {
  'use strict';

  /* ============================ Toasts ============================ */
  function toastRoot() {
    let r = U.$('#toast-root');
    if (!r) { r = U.el('div', { id: 'toast-root', class: 'toast-root' }); document.body.appendChild(r); }
    return r;
  }

  /**
   * UI.toast({ title, body?, icon?, type? 'ok|warn|bad|info|xp', duration?, onTap? })
   */
  function toast({ title, body = '', icon = 'info', type = 'info', duration = 4200, onTap }) {
    const root = toastRoot();
    const t = U.el('div', { class: `toast ${type}`, role: 'status' });
    t.innerHTML = `
      <span class="t-icon">${U.icon(icon, 19)}</span>
      <div class="t-body"><b>${U.esc(title)}</b>${body ? `<span>${U.esc(body)}</span>` : ''}</div>
      <button class="t-x icon-btn sm" aria-label="Dismiss">${U.icon('x', 14)}</button>`;
    const closeBtn = t.querySelector('.t-x');
    const kill = () => { t.classList.add('leaving'); setTimeout(() => t.remove(), 240); };
    closeBtn.addEventListener('click', e => { e.stopPropagation(); kill(); });
    if (onTap) { t.style.cursor = 'pointer'; t.addEventListener('click', () => { kill(); onTap(); }); }
    // progress line duration
    requestAnimationFrame(() => {
      const bar = document.createElement('style');
      bar.textContent = `.toast::after{animation-duration:${duration}ms}`;
      t.appendChild(bar);
    });
    root.appendChild(t);
    setTimeout(kill, duration);
    sound(type === 'xp' ? 'xp' : 'ping');
    return t;
  }

  /* ============================ Sounds ============================ */
  let audioCtx = null;
  /** Tiny synthesized blips — no audio files needed. */
  function sound(kind) {
    try {
      if (!Store.state.settings.sounds) return;
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const freqs = { ping: 720, xp: [620, 930], pop: 420 }[kind] || 600;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.value = .045;
      o.type = 'sine';
      const seq = Array.isArray(freqs) ? freqs : [freqs];
      seq.forEach((f, i) => {
        o.frequency.setValueAtTime(f, audioCtx.currentTime + i * .09);
      });
      o.start();
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .22 + seq.length * .09);
      o.stop(audioCtx.currentTime + .25 + seq.length * .09);
    } catch (e) { /* autoplay policies etc. */ }
  }

  /* ============================ Modals ============================ */
  const modalStack = [];

  /**
   * UI.modal.open({ title, body(html), footer(html)?, wide|slim|sheet|drawer,
   *                 onClose, onOpen(rootEl) }) → { root, close }
   */
  function openModal(opts) {
    let root = U.$('#modal-root');
    if (!root) { root = U.el('div', { id: 'modal-root', class: 'modal-root' }); document.body.appendChild(root); }
    root.classList.add('open');
    root.innerHTML = `
      <div class="modal-scrim" data-close></div>
      <div class="${opts.drawer ? 'drawer-card' : 'modal-card'} ${opts.wide ? 'wide' : ''} ${opts.slim ? 'slim' : ''} ${opts.sheet ? 'as-sheet' : ''}" role="dialog" aria-modal="true">
        ${opts.sheet ? '<div class="grabber"></div>' : ''}
        ${opts.drawer
          ? `<div class="spread" style="padding:.9rem .5rem .7rem 1.1rem; border-bottom:1px solid var(--brd-1);">
               <h3 style="font-family:var(--font-d);font-size:1.02rem;">${opts.title}</h3>
               <button class="icon-btn" data-close>${U.icon('x')}</button></div>`
          : `<div class="modal-head"><h3>${opts.title}</h3>
               <button class="icon-btn" data-close aria-label="Close">${U.icon('x')}</button></div>`}
        <div class="${opts.drawer ? 'zdrawer-thread' : 'modal-body'}">${opts.body || ''}</div>
        ${opts.footer && !opts.drawer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
      </div>`;

    const card = root.querySelector('.modal-card, .drawer-card');
    const api = {
      root, card,
      close() {
        root.classList.remove('open');
        setTimeout(() => { if (!modalStack.length) root.innerHTML = ''; }, 230);
        const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1);
        opts.onClose && opts.onClose();
      }
    };

    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', api.close));
    if (opts.onOpen) opts.onOpen(card);
    modalStack.push(api);
    return api;
  }

  function closeModal() { const top = modalStack[modalStack.length - 1]; top && top.close(); }
  const anyModalOpen = () => modalStack.length > 0;

  /* ------------------------- confirm / prompt ------------------------- */
  function confirm({ title = 'Are you sure?', body = '', okLabel = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
      const m = openModal({
        title, slim: true,
        body: `<p style="color:var(--txt2);font-size:.92rem;">${body}</p>`,
        footer: `<button class="btn btn-glass" data-no>Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${U.esc(okLabel)}</button>`,
        onClose: () => resolve(false)
      });
      m.card.querySelector('[data-ok]').addEventListener('click', () => { resolve(true); m.close(); });
      m.card.querySelector('[data-no]').addEventListener('click', () => m.close());
    });
  }

  function prompt({ title = '', label = '', value = '', placeholder = '', okLabel = 'Save' } = {}) {
    return new Promise(resolve => {
      const m = openModal({
        title, slim: true,
        body: `<div class="field"><label>${U.esc(label)}</label>
                 <input class="input" id="__prompt_input" value="${U.esc(value)}" placeholder="${U.esc(placeholder)}">
               </div>`,
        footer: `<button class="btn btn-glass" data-no>Cancel</button>
                 <button class="btn btn-primary" data-ok>${U.esc(okLabel)}</button>`,
        onClose: () => resolve(null)
      });
      const input = m.card.querySelector('#__prompt_input');
      input.focus(); input.select();
      const done = () => { const v = input.value.trim(); resolve(v || null); m.close(); };
      m.card.querySelector('[data-ok]').addEventListener('click', done);
      m.card.querySelector('[data-no]').addEventListener('click', () => m.close());
      input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    });
  }

  /* ============================ Dropdown menus ============================ */
  let activeMenu = null;
  let menuCleanupFns = [];

  function closeMenu() {
    if (activeMenu) { activeMenu.remove(); activeMenu = null; }
    menuCleanupFns.forEach(fn => fn());
    menuCleanupFns = [];
  }

  /**
   * UI.menu(anchorEl, items[{label, icon, danger, header, sepBefore, onClick}])
   */
  function menu(anchor, items) {
    closeMenu();
    const m = U.el('div', { class: 'pop-menu', role: 'menu' });
    items.forEach(it => {
      if (it.sepBefore) m.appendChild(U.el('hr'));
      if (it.header) { m.appendChild(U.el('div', { class: 'pm-label' }, it.label)); return; }
      const b = U.el('button', { class: it.danger ? 'danger' : '' });
      b.innerHTML = `${it.icon ? U.icon(it.icon, 16) : '<span style="width:16px"></span>'}<span>${U.esc(it.label)}</span>`;
      b.addEventListener('click', () => { closeMenu(); it.onClick && it.onClick(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = Math.min(r.left, window.innerWidth - mw - 10);
    let y = r.bottom + 6;
    if (y + mh > window.innerHeight - 10) y = Math.max(10, r.top - mh - 6);
    if (r.right < 120) x = r.right + 8; // rail buttons → flyout to the right
    m.style.left = x + 'px'; m.style.top = y + 'px';
    activeMenu = m;

    const onDocClick = e => { if (!m.contains(e.target)) closeMenu(); };
    const onEsc = e => { if (e.key === 'Escape') closeMenu(); };
    setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onEsc);
      menuCleanupFns.push(() => {
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onEsc);
      });
    });
    return m;
  }

  /* ============================ Emoji picker ============================ */
  const EMOJI_TABS = {
    'Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','🙂','😊','😇','🥰','😍','😘','😋','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😴','🤯','🥶','😎','🤠','🫠','😅'],
    'Gestures': ['👍','👎','👏','🙌','🤝','🙏','💪','🫡','👋','🖖','✌️','🤙','👌','🤌','🔥','💫','✨','⚡','💯','🏆','🎯','🧠','👀','🫶'],
    'Objects': ['💻','⌨️','🖱️','📱','🎧','🎸','🎮','🕹️','📷','📚','✏️','📌','📎','☕','🍕','🍜','🌮','🍩','🌱','🌙','☀️','🌈','🚀','🛸','⚽','🏎️'],
    'Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','✅','❌','⭐','🌟','💡','🔔','💬','♻️','🔒','⚠️','❓','❗','💤']
  };

  function emojiPicker(anchor, onPick) {
    U.$('.emoji-pop')?.remove();
    const recents = Store.state.meta.recentEmoji || [];
    const pop = U.el('div', { class: 'emoji-pop' });
    const tabs = Object.keys(EMOJI_TABS);
    let current = recents.length ? 'Recent' : tabs[0];

    if (recents.length) EMOJI_TABS['Recent'] = recents;

    pop.innerHTML = `<div class="ep-tabs">${Object.keys(EMOJI_TABS).map(t =>
      `<button data-tab="${t}" title="${t}" class="${t === current ? 'on' : ''}">${t === 'Smileys' ? '😀' : t === 'Gestures' ? '👍' : t === 'Objects' ? '🎮' : t === 'Symbols' ? '❤️' : '🕘'}</button>`).join('')}
      </div><div class="ep-grid"></div>`;

    const grid = pop.querySelector('.ep-grid');
    function renderGrid() {
      grid.innerHTML = (EMOJI_TABS[current] || []).map(e => `<button data-emoji="${e}">${e}</button>`).join('');
    }
    renderGrid();

    pop.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      current = b.dataset.tab;
      pop.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === current));
      renderGrid();
    }));
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-emoji]');
      if (!b) return;
      const em = b.dataset.emoji;
      const rec = Store.state.meta.recentEmoji;
      Store.state.meta.recentEmoji = [em, ...rec.filter(x => x !== em)].slice(0, 12);
      Store.save();
      delete EMOJI_TABS['Recent'];
      onPick(em);
      cleanup();
    });

    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = U.clamp(r.left - pw / 2, 10, window.innerWidth - pw - 10);
    let y = r.top - ph - 8;
    if (y < 10) y = r.bottom + 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';

    const onDoc = e => { if (!pop.contains(e.target)) cleanup(); };
    const onKey = e => { if (e.key === 'Escape') cleanup(); };
    function cleanup() {
      pop.remove();
      delete EMOJI_TABS['Recent'];
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    }
    setTimeout(() => {
      document.addEventListener('click', onDoc);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ============================ Confetti ============================ */
  function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 26) {
    const wrap = U.el('div', { class: 'confetti' });
    wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
    const colors = ['#7C5CFF', '#22D3EE', '#F472B6', '#FBBF24', '#34D399'];
    for (let i = 0; i < n; i++) {
      const p = U.el('i');
      p.style.background = U.rand(colors);
      p.style.setProperty('--dx', U.randInt(-130, 130) + 'px');
      p.style.setProperty('--rot', U.randInt(-360, 360) + 'deg');
      p.style.animationDelay = (Math.random() * .18) + 's';
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1400);
  }

  /* ============================ Skeletons ============================ */
  const skeletonCards = (n = 6) =>
    `<div class="skeleton-grid">${Array.from({ length: n }, () =>
      `<div><div class="sk sk-card"></div><div class="sk sk-line" style="width:70%;margin-top:.7rem;"></div><div class="sk sk-line" style="width:45%;"></div></div>`).join('')}
    </div>`;

  /* ============================ misc ============================ */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = U.el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  return { toast, sound, openModal, closeModal, anyModalOpen, confirm, prompt, menu, closeMenu, emojiPicker, confetti, skeletonCards, copyText };
})();
