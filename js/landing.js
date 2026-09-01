/* ==========================================================================
   Zeek · landing.js — hero preview animation, reveals, counters.
   ========================================================================== */

window.Landing = (() => {
  'use strict';

  /* Hero preview script — cycles like a live conversation */
  const SCRIPT = [
    { side: 'left', name: 'Kai', color: 'hsl(262 70% 60%)', text: 'just shipped the new build 🚀 zero downtime this time' },
    { side: 'right', name: 'You', color: '', text: 'insane. did the edge functions hold up?' },
    { side: 'left', name: 'Mia', color: 'hsl(190 75% 45%)', text: 'like a dream. p95 down 40% 👀' },
    { side: 'left', name: 'Zeek AI ✨', color: '', text: 'Summary: v2.1 shipped clean — latency improved 40%.', ai: true },
    { side: 'right', name: 'You', color: '', text: 'poll: game night friday or saturday?' },
    { side: 'left', name: 'Kai', color: 'hsl(262 70% 60%)', text: 'friday. obviously. we ship fast here 😤' }
  ];

  const RING_ROOMS = [
    ['🛋️', 'Orbit Lounge', 'LIVE'],
    ['🎮', 'Pixel Arena', '2.1k'],
    ['👨‍💻', 'The Code Forge', 'HOT'],
    ['📚', 'Late Night Study', ''],
    ['🎧', 'Sound Wave', ''],
    ['😂', 'Meme Harbor', 'HOT'],
    ['🚀', 'Future Tech', ''],
    ['⚽', 'Sports Bar', ''],
    ['🎨', 'Design Deck', '']
  ];

  /** Arrange the community chips on a rotating 3D cylinder. */
  function buildRing() {
    const ring = U.$('#roomRing'); if (!ring) return;
    const n = RING_ROOMS.length;
    const itemW = 200;
    const radius = Math.round((itemW / 2) / Math.tan(Math.PI / n)) + 46;
    RING_ROOMS.forEach(([ic, name, tag], i) => {
      const el = U.el('div', { class: 'ring-item' });
      el.innerHTML = `<span class="ri-ic">${ic}</span><span class="ri-n">${U.esc(name)}${tag ? ` <small>${tag}</small>` : ''}</span>`;
      el.style.transform = `rotateY(${(360 / n) * i}deg) translateZ(${radius}px)`;
      ring.appendChild(el);
    });
  }

  function init() {
    // Version chip(s)
    U.$$('[data-app-version]').forEach(el => { el.textContent = 'v' + window.ZeekConfig.VERSION; });

    // Spinning 3D ring of communities
    buildRing();

    // Nav scroll state
    const nav = U.$('#landNav');
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    // Animated preview messages
    const wrap = U.$('#pwMsgs');
    if (wrap) {
      let i = 0;
      const push = () => {
        const m = SCRIPT[i % SCRIPT.length];
        i++;
        const div = U.el('div', { class: `pw-msg ${m.side === 'right' ? 'mine' : ''}` });
        div.innerHTML = `
          ${m.side === 'right' ? '' : `<span class="avatar" style="width:30px;height:30px;font-size:.6rem;--av-bg:${m.color || 'var(--grad)'}">${m.name[0]}</span>`}
          <div class="pw-bubble"><div class="pw-name" style="${m.ai ? 'background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;' : ''}">${U.esc(m.name)}</div>${U.esc(m.text)}</div>`;
        wrap.appendChild(div);
        while (wrap.children.length > 4) wrap.firstChild.remove();
      };
      for (let k = 0; k < 3; k++) push();
      setInterval(push, 2300);
    }

    // Subtle 3D tilt on the preview window (desktop only)
    const stage = U.$('#heroStage');
    if (stage && matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.addEventListener('mousemove', e => {
        const r = stage.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - .5) * -6;
        const ry = ((e.clientX - r.left) / r.width - .5) * 6;
        stage.querySelector('.preview-window').style.transform = `rotateX(${6 + rx}deg) rotateY(${ry}deg)`;
      });
      stage.addEventListener('mouseleave', () => {
        stage.querySelector('.preview-window').style.transform = '';
      });
    }

    // Reveal on scroll
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('shown'); io.unobserve(en.target); }
    }), { threshold: .12 });
    U.$$('.reveal').forEach(el => io.observe(el));

    // Counters
    const cio = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      cio.unobserve(el);
      const target = parseInt(el.dataset.count, 10);
      const t0 = performance.now(), dur = 1400;
      const tick = t => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = U.fmtCount(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: .5 });
    U.$$('[data-count]').forEach(el => cio.observe(el));

    // REAL online counter — subscribes to the lobby presence channel.
    // Shows "—" until a Supabase project is configured in js/config.js.
    const oc = U.$('[data-online-count]');
    if (oc && window.SB?.configured()) {
      try {
        const ch = SB.client.channel('drift-lobby');
        ch.on('presence', { event: 'sync' }, () => {
          let n = 0;
          Object.values(ch.presenceState()).forEach(metas => {
            const meta = Array.isArray(metas) ? metas[0] : metas;
            if (meta?.user_id) n++;
          });
          oc.textContent = U.fmtCount(n);
        }).subscribe();
      } catch (e) { /* counter stays as-is */ }
    }

    // Smooth anchors
    U.$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const t = U.$(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    }));
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Landing.init);
