/* ==========================================================================
   Drift · utils.js — DOM helpers, formatting, avatars and the icon library
   Exposed globally as `U`.
   ========================================================================== */

window.U = (() => {
  'use strict';

  /* ------------------------------------------------------------------
     Tiny DOM helpers
  ------------------------------------------------------------------ */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Escape untrusted text before injecting into innerHTML. */
  const esc = (s = '') => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /** Create an element with attributes/children in one call. */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ------------------------------------------------------------------
     Ids, randomness, math
  ------------------------------------------------------------------ */
  let uidCounter = Date.now();
  const uid = (p = 'id') => `${p}_${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];
  const chance = p => Math.random() < p;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** Deterministic string hash → useful for stable hues. */
  function hashCode(str = '') {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  const hueOf = str => hashCode(str) % 360;

  /* ------------------------------------------------------------------
     Formatting
  ------------------------------------------------------------------ */
  const fmtCount = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M'
                   : n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0', '') + 'k'
                   : String(n);

  const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function fmtRel(ts) {
    const d = Date.now() - ts;
    if (d < 45e3) return 'just now';
    const m = Math.round(d / 6e4);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const dd = Math.round(h / 24);
    if (dd < 7) return `${dd}d ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function fmtDayDivider(ts) {
    const now = new Date(); const d = new Date(ts);
    const startOfDay = t => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const diff = (startOfDay(now) - startOfDay(d)) / 864e5;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const throttle = (fn, ms = 200) => { let last = 0, t; return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); } else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); } }; };

  /* ------------------------------------------------------------------
     Avatars — deterministic gradient + initials/emoji
  ------------------------------------------------------------------ */
  function avatarBg(u) {
    const h = u.hue ?? hueOf(u.username || u.id || 'x');
    return `linear-gradient(135deg, hsl(${h} 72% 55%), hsl(${(h + 48) % 360} 78% 44%))`;
  }

  /**
   * Render an avatar span.
   * opts: { size, clickable, presence(bool), ring(level ring) }
   */
  function avatar(u, opts = {}) {
    const size = opts.size || 38;
    const inner = u.avatarEmoji
      ? `<span class="av-emoji">${esc(u.avatarEmoji)}</span>`
      : esc(initials(u.displayName || u.username));
    const pres = (opts.presence && u.status)
      ? `<span class="presence ${esc(u.status)}"></span>` : '';
    const style = `width:${size}px;height:${size}px;font-size:${Math.max(9, Math.round(size * .36))}px;--av-bg:${avatarBg(u)}`
      + (opts.ring ? `;--lvl-pct:${u.lvlPct || 0}` : '');
    return `<span class="avatar${opts.clickable ? ' clickable' : ''}${opts.ring ? ' level-ring' : ''}" `
      + `style="${style}" ${opts.clickable ? `data-user-card="${esc(u.id)}" role="button" tabindex="0"` : ''}`
      + ` title="${esc(u.displayName || u.username)}">${inner}${pres}</span>`;
  }

  /* ------------------------------------------------------------------
     Icon library — hand-drawn 24px stroke icons (no external requests)
  ------------------------------------------------------------------ */
  const ICONS = {
    home: '<path d="M5 10.4 12 4.2l7 6.2V19a1.6 1.6 0 0 1-1.6 1.6H14v-5.4h-4v5.4H6.6A1.6 1.6 0 0 1 5 19Z"/>',
    compass: '<circle cx="12" cy="12" r="8.6"/><path d="m15 9-1.7 4.3L9 15l1.7-4.3Z"/>',
    layers: '<path d="M12 3.2 3.4 8l8.6 4.8L20.6 8Z"/><path d="m3.4 12.6 8.6 4.8 8.6-4.8"/><path d="m3.4 16.8 8.6 4.8 8.6-4.8" opacity=".45"/>',
    users: '<circle cx="9" cy="8.2" r="3.4"/><path d="M3.4 19.5c.4-3.1 2.7-4.7 5.6-4.7s5.2 1.6 5.6 4.7"/><path d="M15.4 5.3a3.1 3.1 0 0 1 0 5.9M17.6 15.1c1.9.5 3 1.9 3.3 4.4"/>',
    bell: '<path d="M18.2 15.9H5.8c1.2-1.4 1.9-2.7 1.9-5.2a4.3 4.3 0 0 1 8.6 0c0 2.5.7 3.8 1.9 5.2Z"/><path d="M10.3 18.9a1.8 1.8 0 0 0 3.4 0"/><path d="M12 4.2V3"/>',
    sparkles: '<path d="m12 3.6 1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9Z"/><path d="M19 14.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" opacity=".65"/><path d="M5 3v3M3.5 4.5h3" opacity=".65"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.6M12 18.6v2.6M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M2.8 12h2.6M18.6 12h2.6M4.9 19.1l1.9-1.9M17.2 6.8l1.9-1.9"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    search: '<circle cx="11" cy="11" r="6.4"/><path d="M20.3 20.3 15.8 15.8"/>',
    send: '<path d="m4.4 11.6 15.4-7.2-7.2 15.4-2.1-6.1Z"/><path d="M19.8 4.4 10.5 13.7"/>',
    smile: '<circle cx="12" cy="12" r="8.6"/><path d="M8.6 13.8a4.4 4.4 0 0 0 6.8 0"/><path d="M9.3 9.5h.01M14.7 9.5h.01" stroke-width="2.6"/>',
    laugh: '<circle cx="12" cy="12" r="8.6"/><path d="M8 13.5a4.2 4.2 0 0 0 8 0Z"/><path d="M9.2 9.3h.01M14.8 9.3h.01" stroke-width="2.6"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    pin: '<path d="M9.2 3.6h5.6l-.8 5.4 2.8 3.4H7.2L10 9Z"/><path d="M12 12.4v8"/>',
    reply: '<path d="M9.6 6.8 4.2 12l5.4 5.2"/><path d="M4.2 12h9.2a6.4 6.4 0 0 1 6.4 6.4v.6"/>',
    edit: '<path d="m4 20 .9-3.9L16.5 4.5a2.1 2.1 0 0 1 3 3L7.9 19.1Z"/><path d="m14.5 6.5 3 3"/>',
    trash: '<path d="M4.6 6.6h14.8M9.6 6.4V4.6h4.8v1.8M6.6 6.6l.8 12.8h9.2l.8-12.8"/><path d="M10 10v6M14 10v6"/>',
    copy: '<rect x="9" y="9" width="11.4" height="11.4" rx="2.4"/><path d="M15 5.6A2.6 2.6 0 0 0 12.4 3H5.6A2.6 2.6 0 0 0 3 5.6v6.8A2.6 2.6 0 0 0 5.6 15"/>',
    flag: '<path d="M5.6 21V3.8"/><path d="M5.6 4.4c4-2 8.2 2 12.8.4v8.4c-4.6 1.6-8.8-2.4-12.8-.4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.6 4.4 4.4L19 7.4"/>',
    checks: '<path d="m2.8 12.8 4.2 4.2 8.4-9"/><path d="m10.4 15.4 2 2 8.4-9"/>',
    'chevron-down': '<path d="m7 10 5 5 5-5"/>',
    'chevron-right': '<path d="m10 7 5 5-5 5"/>',
    'chevron-left': '<path d="m14 7-5 5 5 5"/>',
    'arrow-left': '<path d="M19 12H5.4M5.4 12l6-6M5.4 12l6 6"/>',
    zap: '<path d="M13.2 3 5.4 13.4h5.8L10.8 21l7.8-10.4h-5.8Z"/>',
    flame: '<path d="M12 3.2s1.1 2.8 3.6 5.3c1.9 2 3.2 4 3.2 6.4a6.8 6.8 0 0 1-13.6 0c0-1.9.7-3.6 1.9-5.1.5 1.1 1.2 1.9 2.3 2.5C9.6 9.6 10.6 6 12 3.2Z"/>',
    trophy: '<path d="M8 4.2h8v5.6a4 4 0 0 1-8 0Z"/><path d="M8 5.4H4.6a3.4 3.4 0 0 0 3.6 3.9M16 5.4h3.4a3.4 3.4 0 0 1-3.6 3.9"/><path d="M12 13.8v3.4M8.6 20.4h6.8M10 17.2h4l.6 3.2H9.4Z"/>',
    gamepad: '<rect x="2.6" y="8.2" width="18.8" height="9.4" rx="4.6"/><path d="M8.2 11v3.6M6.4 12.8H10"/><circle cx="15.3" cy="11.7" r="1.15" fill="currentColor" stroke="none"/><circle cx="17.6" cy="13.9" r="1.15" fill="currentColor" stroke="none"/>',
    chart: '<path d="M5 20V12.5M12 20V4.5M19 20v-4.8"/>',
    shield: '<path d="M12 3.2 5 5.9v5.3c0 4.6 3 7.7 7 9.4 4-1.7 7-4.8 7-9.4V5.9Z"/><path d="m9 11.8 2.2 2.2 3.8-4"/>',
    logout: '<path d="M14.6 8V5.6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V16M9.8 12H21M21 12l-3-3M21 12l-3 3"/>',
    eye: '<path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.9"/>',
    'eye-off': '<path d="M4 4l16 16"/><path d="M10 5.9A8.7 8.7 0 0 1 12 5.8c5.8 0 9.4 6.2 9.4 6.2a17 17 0 0 1-2.9 3.5M14.5 18a8.6 8.6 0 0 1-2.5.2C6.2 18.2 2.6 12 2.6 12a17.5 17.5 0 0 1 3.2-3.8"/><path d="M9.9 9.9a2.9 2.9 0 0 0 4.1 4.1"/>',
    lock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.4"/><path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.6 0v2.5"/><path d="M12 14.4v2.4"/>',
    globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.7 2.6 4 5.6 4 8.6s-1.3 6-4 8.6c-2.7-2.6-4-5.6-4-8.6s1.3-6 4-8.6Z"/>',
    hash: '<path d="M9.6 4.2 8.1 19.8M15.9 4.2l-1.5 15.6M4.6 9.1h15M4 14.9h15"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2v5l3.1 1.9"/>',
    heart: '<path d="M12 20.2S4.2 15.4 4.2 9.9A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.8 2.6C19.8 15.4 12 20.2 12 20.2Z"/>',
    message: '<path d="M12 3.6a8.4 8.4 0 0 1 0 16.8c-1.4 0-2.7-.3-3.8-.9l-4.6 1 1-4.4A8.4 8.4 0 0 1 12 3.6Z"/>',
    star: '<path d="m12 3.6 2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7"/>',
    moon: '<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6Z"/>',
    monitor: '<rect x="3" y="4.4" width="18" height="12.2" rx="2.2"/><path d="M9 20.6h6M12 16.6v4"/>',
    volume: '<path d="M4 9.6v4.8h3.4L12 18.6V5.4L7.4 9.6Z"/><path d="M15.4 9.2a4.4 4.4 0 0 1 0 5.6M18 6.8a8 8 0 0 1 0 10.4"/>',
    download: '<path d="M12 4v10.2m0 0 3.8-3.8M12 14.2 8.2 10.4"/><path d="M4.6 19.4h14.8"/>',
    alert: '<path d="M12 3.8 2.9 19.4h18.2Z"/><path d="M12 10v4.2M12 16.8h.01" stroke-width="2.4"/>',
    crown: '<path d="m4.4 8.4 4.3 3L12 5.2l3.3 6.2 4.3-3-1.5 10.2H5.9Z"/>',
    refresh: '<path d="M20 5.2v4.6h-4.6"/><path d="M19.6 9.8a8 8 0 1 0 .4 3"/>',
    filter: '<path d="M4 5.2h16l-6.2 7.3v6.1l-3.6-2v-4.1Z"/>',
    activity: '<path d="M3 12h3.6L9 6.2l4.4 11.6L16 12h5"/>',
    book: '<path d="M12 6.2C10 4.7 7.6 4.2 4 4.2v14.4c3.6 0 6 .5 8 2 2-1.5 4.4-2 8-2V4.2c-3.6 0-6 .5-8 2Z"/><path d="M12 6.2v14.4"/>',
    code: '<path d="m8.6 8.2-4.4 3.8 4.4 3.8M15.4 8.2l4.4 3.8-4.4 3.8M13.2 5.4l-2.4 13.2"/>',
    music: '<path d="M9 18.4V6.2L20 4v12.2"/><circle cx="6.7" cy="18.4" r="2.3"/><circle cx="17.7" cy="16.2" r="2.3"/>',
    dice: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4"/><circle cx="8.4" cy="8.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.6" cy="8.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.4" cy="15.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.6" cy="15.6" r="1.2" fill="currentColor" stroke="none"/>',
    palette: '<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.6a2.2 2.2 0 0 0 0-4.4h-1.2a2 2 0 0 1 0-4h6.2a2.4 2.4 0 0 0 2.4-2.5A9.1 9.1 0 0 0 12 3.2Z"/><circle cx="7.6" cy="10.2" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.4" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.8" cy="7" r="1.2" fill="currentColor" stroke="none"/>',
    cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><rect x="10.6" y="10.6" width="2.8" height="2.8"/><path d="M9.2 3.6V7M14.8 3.6V7M9.2 17v3.4M14.8 17v3.4M3.6 9.2H7M3.6 14.8H7M17 9.2h3.4M17 14.8h3.4"/>',
    sofa: '<path d="M5.2 10.4V8.2a2.4 2.4 0 0 1 2.4-2.4h8.8a2.4 2.4 0 0 1 2.4 2.4v2.2"/><path d="M3.4 12.6a1.9 1.9 0 0 1 3.8 0v1.2h9.6v-1.2a1.9 1.9 0 1 1 3.8 0v3.6a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8Z"/><path d="M5.4 18v2M18.6 18v2"/>',
    wand: '<path d="m4 20 11.4-11.4"/><path d="M17.4 3.4 18.6 6l2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6L13.6 7.2 16.2 6Z" transform="translate(1 -1) scale(.82)"/>',
    bulb: '<path d="M9.6 17.6h4.8M10.4 20.6h3.2"/><path d="M12 3.4a5.9 5.9 0 0 1 3.4 10.7c-.7.5-1 1.3-1 2.1H9.6c0-.8-.3-1.6-1-2.1A5.9 5.9 0 0 1 12 3.4Z"/>',
    translate: '<path d="M4 5.2h8.4M8.2 3.4v1.8c0 3.2-1.9 6.2-5.2 7.8M5.4 9.4c1 2.6 3.1 4.7 6.2 5.6"/><path d="m12.8 20.6 3.8-8.8 3.8 8.8M14.3 17.6h4.6"/>',
    list: '<path d="M4.5 6.4h15M4.5 11h15M4.5 15.6h9.5M4.5 20h7"/>',
    ban: '<circle cx="12" cy="12" r="8.6"/><path d="m6 6 12 12"/>',
    'user-plus': '<circle cx="10" cy="8.4" r="3.4"/><path d="M3.6 19.8c.4-3 2.6-4.6 6.4-4.6 1.3 0 2.4.2 3.4.7"/><path d="M18.4 14v5.2M15.8 16.6H21"/>',
    mail: '<rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/><path d="m3.6 7.2 8.4 6 8.4-6"/>',
    external: '<path d="M13.6 5h5.4v5.4M19 5l-8.2 8.2"/><path d="M19 13.6V18a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 18V6.8A1.8 1.8 0 0 1 6 5h4.4"/>',
    info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5M12 7.6h.01" stroke-width="2.4"/>',
    rocket: '<path d="M12 3.4c3.1 1.9 4.7 5.2 4.7 8.9l2.1 3.6-3.7-1a12.6 12.6 0 0 1-6.2 0l-3.7 1 2.1-3.6C7.3 8.6 8.9 5.3 12 3.4Z"/><circle cx="12" cy="9.4" r="1.7"/><path d="M12 16.2v3.4M9 18l1.2 2.6M15 18l-1.2 2.6" opacity=".6"/>',
    // Filled dots used by "more" menus
    dots: '<circle cx="5.2" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.8" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
  };

  function icon(name, size = 18, cls = '') {
    const body = ICONS[name] || ICONS.hash;
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
      + `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* ------------------------------------------------------------------
     Brand logo (inline SVG, matches assets/favicon.svg)
  ------------------------------------------------------------------ */
  const logoSvg = (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="lg-${s}" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#22D3EE"/><stop offset=".55" stop-color="#7C5CFF"/><stop offset="1" stop-color="#F472B6"/>
    </linearGradient></defs>
    <rect width="48" height="48" rx="12" fill="url(#lg-${s})"/>
    <path d="M9 29c5-13 11-13 15-1 3 9 8 9 14-2" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M12 19c4-9 9-9 13 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  </svg>`;

  const logoHTML = (s = 30) => `<span class="logo">${logoSvg(s)}<span class="logo-name">Dri<b>ft</b></span></span>`;

  return {
    $, $$, esc, el, uid, randInt, rand, chance, clamp, shuffle, hashCode, hueOf,
    fmtCount, fmtTime, fmtRel, fmtDayDivider, initials, debounce, throttle,
    avatar, avatarBg, icon, logoHtml: logoHTML, logoSvg
  };
})();
