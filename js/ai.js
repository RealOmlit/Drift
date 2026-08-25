/* ==========================================================================
   Drift · ai.js — "Zephyr", Drift's built-in AI companion.
   ───────────────────────────────────────────────────────────────────────────
   Two layers:
   1) RemoteAI  → clearly marked integration point for YOUR backend proxy.
                  ⚠️ NEVER put an API key in front-end code. Point
                  DriftConfig.AI_PROXY_URL at a serverless function that holds
                  the key and forwards to OpenAI / Anthropic / etc.
   2) LocalEngine → offline fallback used while AI_PROXY_URL is null so the
                  demo is fully functional without any credentials.
   ========================================================================== */

window.AI = (() => {
  'use strict';
  const CFG = window.DriftConfig;

  const IDENTITY = {
    name: 'Zephyr',
    role: 'Drift\'s resident AI companion',
    avatar: '✨'
  };

  /* =====================================================================
     REMOTE INTEGRATION LAYER  [BACKEND]
     Replace `null` in config with your proxy endpoint. The request shape:
       POST { messages:[{role,content}], persona, context? } → { text }
  ====================================================================== */
  function remoteComplete(messages, context) {
    return new Promise(resolve => {
      if (!CFG.AI_PROXY_URL) { resolve(null); return; } // fall back to local engine
      fetch(CFG.AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          persona: Store.state.settings.aiPersona,
          context: Store.state.settings.aiContext ? context : null
        })
      })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(d => resolve(d?.text ?? null))
        .catch(() => resolve(null));
    });
  }

  /* =====================================================================
     LOCAL ENGINE — keyword-routed, context-aware canned intelligence.
  ===================================================================== */
  function recentMessages(roomId, n = 24) {
    return Store.roomMessages(roomId).filter(m => !m.deleted && m.type === 'text').slice(-n);
  }

  function summarizeRoom(roomId) {
    const msgs = recentMessages(roomId, 40);
    if (!msgs.length) return 'This room is quiet right now — nothing to summarize yet. Post something and I\'ll keep track! ✨';
    const people = [...new Set(msgs.map(m => Store.getUser(m.userId)?.displayName).filter(Boolean))];
    const questions = msgs.filter(m => m.text.includes('?')).slice(-3);
    const longest = [...msgs].sort((a, b) => b.text.length - a.text.length).slice(0, 2);
    const lines = [
      `**Recap of the last ${msgs.length} messages:**`,
      `• ${people.length} voices in the mix — ${people.slice(0, 4).join(', ')}${people.length > 4 ? ' and others' : ''}.`
    ];
    if (questions.length) lines.push(`• Open questions: ${questions.map(q => `"${q.text.slice(0, 60)}${q.text.length > 60 ? '…' : ''}"`).join(' · ')}`);
    if (longest[0]) lines.push(`• Main thread: "${longest[0].text.slice(0, 90)}${longest[0].text.length > 90 ? '…' : ''}"`);
    lines.push(`• Vibe check: ${msgs.some(m => /😂|🤣|lol|haha/i.test(m.text)) ? 'playful 😄' : msgs.some(m => /\?|help|stuck/i.test(m.text)) ? 'curious & collaborative 🧭' : 'steady conversation 💬'}`);
    return lines.join('\n');
  }

  function explainLast(roomId) {
    const msgs = recentMessages(roomId, 10);
    const last = [...msgs].reverse().find(m => m.userId !== 'me');
    if (!last) return 'Nothing to explain yet — send a few messages and ask me again.';
    const u = Store.getUser(last.userId);
    return [
      `**Explaining ${u?.displayName}'s message:**`,
      `"${last.text.slice(0, 140)}"`,
      '',
      `Reading between the lines: it reads as ${/!$/.test(last.text) ? 'enthusiastic — they want engagement' : /\?$/.test(last.text) ? 'an invitation — they\'re asking for input' : 'a status update — acknowledgment would land well'}.`,
      `A good reply could build on it, e.g. react with specifics rather than just "nice".`
    ].join('\n');
  }

  const TOPIC_SEEDS = ['weekend plans', 'hidden-gem recommendations', 'hot takes (mild ones)', 'goals for this month', 'favorite tools of the week', 'something you learned today'];
  function suggestTopics(roomId) {
    const room = Store.getRoom(roomId);
    const cat = room?.category || 'general';
    const pool = {
      gaming: ['most underrated game of the year?', 'controller vs keyboard — final showdown', 'games that deserve a remaster'],
      coding: ['what\'s your favorite dev tool this month?', 'worst bug you\'ve ever shipped?', 'monorepo or polyrepo — where do you stand?'],
      study: ['best focus technique that actually works?', 'study playlists — share yours', 'how do you beat exam anxiety?'],
      music: ['guilty pleasure song reveal', 'concert vs festival — which is better?', 'one album start-to-finish, no skips'],
      general: TOPIC_SEEDS
    }[cat] || TOPIC_SEEDS;
    return '**Conversation starters for this room:**\n' + U.shuffle(pool).slice(0, 4).map(t => `• ${t}`).join('\n');
  }

  function ideas(subject) {
    const topic = subject.replace(/^.*?(ideas?\s*(for|about)?|brainstorm)\s*/i, '').trim() || 'that';
    return `**5 quick ideas around ${topic}:**\n• Start with the smallest version that could possibly be interesting\n• Invert it — what would the worst version look like? Avoid that\n• Steal a format from another field and remix it\n• Ask "what would this look like in 5 years?" then do that now, smaller\n• Pair up: two perspectives beat one perfect plan`;
  }

  /* Tiny demo translator — honest about its limits. */
  const MINI_DICT = {
    es: { hello: 'hola', friend: 'amigo', thanks: 'gracias', good: 'bueno', morning: 'mañana', night: 'noche', love: 'amor', chat: 'chat', today: 'hoy', tomorrow: 'mañana', water: 'agua', coffee: 'café', game: 'juego', music: 'música' },
    fr: { hello: 'bonjour', friend: 'ami', thanks: 'merci', good: 'bon', morning: 'matin', night: 'nuit', love: 'amour', chat: 'discussion', today: 'aujourd\'hui', tomorrow: 'demain', water: 'eau', coffee: 'café', game: 'jeu', music: 'musique' }
  };
  function translate(text, lang) {
    const dict = MINI_DICT[lang] || MINI_DICT.es;
    const words = text.split(/(\s+)/).map(w => {
      const key = w.toLowerCase().replace(/[^a-z]/g, '');
      return dict[key] ? w.replace(new RegExp(key, 'i'), dict[key]) : w;
    }).join('');
    return `**Demo translation (${lang === 'fr' ? 'French' : 'Spanish'}):**\n"${words}"\n\n_This offline demo translates common words only. Connect an AI API via \`AI_PROXY_URL\` for full-quality translation._`;
  }

  function rewrite(text, mode) {
    let out = text.trim();
    if (mode === 'polite') {
      out = out.replace(/\bcan't\b/gi, 'am unable to').replace(/\bwon't\b/gi, 'would prefer not to')
               .replace(/\bstupid\b/gi, 'questionable').replace(/!+/g, '.');
      out = out.charAt(0).toUpperCase() + out.slice(1);
      if (!/[.!?]$/.test(out)) out += '.';
      out = 'Just to share — ' + out.charAt(0).toLowerCase() + out.slice(1);
    } else if (mode === 'concise') {
      const filler = /\b(really|actually|basically|just|very|quite|kind of|sort of|honestly)\b\s*/gi;
      out = out.replace(filler, '').replace(/\s+/g, ' ');
      const firstStop = out.search(/[.!?](\s|$)/);
      if (firstStop > 20) out = out.slice(0, firstStop + 1);
    } else { // friendly
      out = out.replace(/\.$/, '') + (/[!?)"]$/.test(out) ? '' : '!') + ' ✨';
    }
    return `**${mode === 'polite' ? 'Polished' : mode === 'concise' ? 'Tightened' : 'Warmed up'} version:**\n"${out}"`;
  }

  const SNIPPETS = {
    js: ['```js\n// debounce — run fn after quiet period\nconst debounce = (fn, ms = 200) => {\n  let t;\n  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };\n};\n```'],
    python: ['```python\n# safe dict dive\ndef get(d, *keys, default=None):\n    for k in keys:\n        d = d.get(k, {}) if isinstance(d, dict) else {}\n    return d or default\n```'],
    css: ['```css\n/* perfect centering, 2026 edition */\n.center {\n  display: grid;\n  place-items: center;\n  min-height: 100dvh;\n}\n```']
  };
  function codeHelp(q) {
    const l = /python|\.py\b/i.test(q) ? 'python' : /css|flex|grid|center/i.test(q) ? 'css' : 'js';
    return `Here's a clean starting point:\n\n${U.rand(SNIPPETS[l])}\nWant me to adapt it to your exact case? Paste the snippet and I'll rework it.`;
  }

  function roomDescription(name, category) {
    const T = {
      general: [`A warm corner of Drift for ${name} — pull up a chair and make yourself at home.`, `Where the ${name} crowd gathers: good chats, zero pressure.`],
      gaming: [`Squad finder and victory-lap zone for ${name} fans. Salt levels moderated.`, `${name} mains unite — clips, strats and LFG threads daily.`],
      coding: [`${name}: ship talk, stack debates and rubber-duck sessions for builders.`, `Debug together, deploy happy. ${name} is our craft corner.`],
      study: [`${name} — quiet focus, loud wins. Timers on, phones down.`, `Body-doubling central: ${name} edition.`],
      music: [`${name} radio, always on. Share tracks, trade playlists.`, `For the ${name} obsessed — headphones recommended.`],
      memes: [`${name}: premium nonsense, curated daily.`, `Certified fresh takes and stale jokes, recycled responsibly at ${name}.`],
      sports: [`${name} matchday HQ — roar responsibly.`, `Scores, stories and strategic suffering at ${name}.`],
      technology: [`${name}: tomorrow's news, discussed today.`, `Signals over noise — ${name} tracks what's actually next.`],
      design: [`${name} — pixels, type and honest critique.`, `Craft club for ${name}: process over polish.`],
      random: [`${name}: exactly what it says on the tin.`, `No theme. No rules* (*two rules). Welcome to ${name}.`]
    }[category] || [`A space for ${name} on Drift.`];
    return U.rand(T);
  }

  function moderationHelp() {
    return '**Moderation toolkit:**\n• **Prevent:** clear pinned rules + slow mode during spikes\n• **Detect:** watch report queue; repeated offenders get muted before bans\n• **De-escalate:** address behavior, not identity; take it private when heated\n• **Document:** reports keep context for future mods\nIn Drift: room settings → Moderators & safety. I can draft rule text too — just ask!';
  }

  /** Safe arithmetic evaluator (no eval). Supports + - * / ( ) % decimals. */
  function tryMath(text) {
    const expr = text.replace(/[×x]/gi, '*').replace(/÷/g, '/').match(/^[\s\d+\-*/%().]+$/);
    if (!expr || !/\d/.test(expr[0]) || !/[-+*/%]/.test(expr[0])) return null;
    try {
      const tokens = expr[0].match(/(\d+\.?\d*|[+\-*/%()])/g);
      let i = 0;
      const peek = () => tokens[i];
      function parseExpr() { let v = parseTerm(); while (peek() === '+' || peek() === '-') { const op = tokens[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r; } return v; }
      function parseTerm() { let v = parseFactor(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = tokens[i++]; const r = parseFactor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; }
      function parseFactor() {
        if (peek() === '(') { i++; const v = parseExpr(); if (tokens[i] === ')') i++; return v; }
        if (peek() === '-') { i++; return -parseFactor(); }
        const n = parseFloat(tokens[i++]); return isNaN(n) ? 0 : n;
      }
      const result = parseExpr();
      if (tokens.length > i || !isFinite(result)) return null;
      return `**${expr[0].trim()} = ${Math.round(result * 1e6) / 1e6}** 🧮`;
    } catch (e) { return null; }
  }

  /** Route a question to the best local capability. */
  function localRespond(input, ctx = {}) {
    const q = input.trim();
    const ql = q.toLowerCase();
    const roomId = ctx.roomId;

    const math = tryMath(q);
    if (/^[\s\d+\-*/%().×x÷]+$/.test(q) && math) return math;

    if (/summar|recap|catch me up|tl;?dr/.test(ql)) return roomId ? summarizeRoom(roomId) : 'Open a room first and I\'ll summarize its recent conversation.';
    if (/explain|what did .*(mean)|clarify/.test(ql)) return roomId ? explainLast(roomId) : explainLast(null);
    if (/topic|talk about|conversation starter|bored/.test(ql)) return suggestTopics(roomId);
    if (/idea|brainstorm|suggest.*(project|plan)/.test(ql)) return ideas(q);
    if (/translat/.test(ql)) {
      const target = /french|français|\bfr\b/.test(ql) ? 'fr' : 'es';
      const payload = q.replace(/^.*?(translate|in spanish|in french|to spanish|to french)[^"']*["']?/i, '').replace(/["']/g, '').trim();
      return translate(payload || (ctx.lastMessage?.text ?? 'hello friend'), target);
    }
    if (/rewrit|rephrase|polite|shorter|more professional|sound (nicer|better)/.test(ql)) {
      const payload = q.replace(/^.*?(rewrite|rephrase)[:\s-]*/i, '').trim();
      const mode = /concise|shorter|tight/i.test(ql) ? 'concise' : /polite|professional|nicer/i.test(ql) ? 'polite' : 'friendly';
      return rewrite(payload || ctx.lastMessage?.text || 'Thanks for the update.', mode);
    }
    if (/room description|describe.*room|write.*desc|about section/.test(ql)) {
      const room = roomId ? Store.getRoom(roomId) : null;
      return `Here are some options:\n• ${roomDescription(room?.name || 'your room', room?.category || 'general')}\n• ${roomDescription('The ' + (room?.name || 'New Room'), room?.category || 'general')}`;
    }
    if (/code|bug|javascript|python|css|function|error|api/.test(ql)) return codeHelp(q);
    if (/moderat|rules|guideline|moderation/.test(ql)) return moderationHelp();
    if (/who are you|what are you|about you/.test(ql)) return `I'm **Zephyr** — ${IDENTITY.role}. I live inside Drift: summaries, translations, icebreakers, math emergencies (` + '`12*(34+8)`' + '), code saves and vibe checks. Ask away!';
    if (/help|what can you do/.test(ql)) return '**Things I\'m good at:**\n• `summarize this room` — instant recap\n• `suggest topics` — kill the silence\n• `translate <text>` — ES/FR demo\n• `rewrite: <message>` — polish any draft\n• `generate a room description`\n• code help, moderation advice, quick math\n\nI get full conversational powers once an AI API is connected via the secure proxy.';
    if (/^(hi|hey|hello|yo|sup)\b/.test(ql)) return U.rand([`Hey ${Store.me()?.displayName || 'there'}! 👋 What are we building, solving or debating today?`, `Hello hello ✨ Need a recap, an idea, or a translation?`]);

    // Generic thoughtful fallback referencing context when available
    const lastMsg = ctx.lastMessage;
    const ctxLine = lastMsg ? `\n\n(Context: the latest message here was "${lastMsg.text.slice(0, 80)}${lastMsg.text.length > 80 ? '…' : ''}")` : '';
    return U.rand([
      `Interesting one. Here's my take: break it into the smallest testable piece and start there.${ctxLine}`,
      `I'd approach it in three steps: define the goal in one sentence, list what's blocking it, then remove the biggest blocker first.${ctxLine}`,
      `Short answer: probably yes, with caveats. Longer answer depends on your constraints — tell me more and I'll get specific.${ctxLine}`
    ]);
  }

  /** Apply persona flavor from Settings → AI. */
  function persona(text) {
    const p = Store.state.settings.aiPersona;
    if (p === 'concise') return text.split('\n').filter((l, i) => i < 2 || l.startsWith('•') || l.startsWith('```')).slice(0, 6).join('\n');
    if (p === 'playful') return text + '\n\n_(zephyr.exe has consumed three imaginary energy drinks)_';
    return text;
  }

  /** Main entry: returns a Promise<string>. Tries remote, falls back local. */
  async function respond(input, ctx = {}) {
    const messages = [{ role: 'user', content: input }];
    const remote = await remoteComplete(messages, ctx.roomContext);
    if (remote) return remote;
    await new Promise(r => setTimeout(r, U.randInt(650, 1400))); // human-ish latency
    return persona(localRespond(input, ctx));
  }

  /* =====================================================================
     UI — full page panel + in-room drawer, sharing one thread renderer
  ===================================================================== */
  const thread = () => Store.state.meta.zephyrThread;

  function pushTurn(role, text) {
    thread().push({ role, text, ts: Date.now() });
    if (thread().length > 80) thread().splice(0, thread().length - 80);
    Store.save();
  }

  function bubbleHTML(turn) {
    if (turn.role === 'user') {
      return `<div class="ai-msg user"><div class="ai-bubble2">${fmtAI(U.esc(turn.text))}</div></div>`;
    }
    return `<div class="ai-msg">
      <div class="ai-av">${IDENTITY.avatar}</div>
      <div class="ai-bubble2"><div class="ai-tag">Zephyr</div>${mdLite(turn.text)}</div>
    </div>`;
  }

  /** Minimal markdown: **bold**, `code`, ```blocks, line breaks. */
  function mdLite(s) {
    let out = U.esc(s);
    out = out.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return out.replace(/\n/g, '<br>');
  }
  const fmtAI = s => s.replace(/\n/g, '<br>');

  const QUICK_TOOLS = [
    ['summarize this room', 'list', 'Summarize'],
    ['suggest topics', 'bulb', 'Icebreakers'],
    ['explain the latest messages', 'info', 'Explain'],
    ['generate a room description', 'wand', 'Room blurb'],
    ['moderation tips', 'shield', 'Mod coach'],
    ['rewrite: thanks for the update', 'edit', 'Rewrite'],
    ['translate hello friend', 'translate', 'Translate']
  ];

  function composerHTML(id) {
    return `
      <div class="ai-composer">
        <textarea id="${id}" rows="1" placeholder="Ask Zephyr anything…"></textarea>
        <button class="ai-send" data-send aria-label="Send">${U.icon('send', 18)}</button>
      </div>
      <div class="small faint" style="margin-top:.45rem;display:flex;gap:.35rem;align-items:center;">
        ${U.icon('info', 13)} Offline demo model · connect an API via <span class="mono">AI_PROXY_URL</span> for full power
      </div>`;
  }

  function bindComposer(container, getContext, scrollEl) {
    const ta = container.querySelector('textarea');
    const send = () => {
      const val = ta.value.trim();
      if (!val) return;
      ta.value = ''; autosize();
      handleUserInput(val, container, getContext, scrollEl);
    };
    container.querySelector('[data-send]').addEventListener('click', send);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; }
    ta.addEventListener('input', autosize);
  }

  async function handleUserInput(val, container, getContext, scrollEl) {
    pushTurn('user', val);
    appendTurn(container, bubbleHTML(thread()[thread().length - 1]));
    scrollBottom(scrollEl);
    // typing indicator
    const typing = U.el('div', { class: 'ai-msg' });
    typing.innerHTML = `<div class="ai-av">${IDENTITY.avatar}</div><div class="ai-bubble2"><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></div>`;
    container.appendChild(typing);
    scrollBottom(scrollEl);

    const answer = await respond(val, getContext ? getContext() : {});
    typing.remove();
    pushTurn('zephyr', answer);
    appendTurn(container, bubbleHTML(thread()[thread().length - 1]));
    scrollBottom(scrollEl);
  }

  function appendTurn(container, html) {
    container.insertAdjacentHTML('beforeend', html);
  }
  function scrollBottom(el) { if (el) el.scrollTop = el.scrollHeight; }

  /* ------------------------------ Full page ------------------------------ */
  function renderPanel(root) {
    root.innerHTML = `
      <div class="view-inner" style="max-width:860px;">
        <div class="ai-wrap">
          <div class="spread" style="padding-bottom:.9rem;border-bottom:1px solid var(--brd-1);">
            <div class="row">
              <div class="ai-av" style="width:44px;height:44px;border-radius:14px;font-size:1.25rem;">${IDENTITY.avatar}</div>
              <div>
                <h1 style="font-size:1.3rem;">Zephyr</h1>
                <div class="small muted">${IDENTITY.role} · persona: <b>${U.esc(Store.state.settings.aiPersona)}</b></div>
              </div>
            </div>
            <button class="btn btn-glass btn-sm" id="zClear">${U.icon('refresh', 15)} New chat</button>
          </div>

          <div class="ai-tools">
            ${QUICK_TOOLS.map(([q, ic, label]) => `<button class="ai-tool-chip" data-q="${U.esc(q)}">${U.icon(ic, 14)} ${label}</button>`).join('')}
          </div>

          <div class="ai-chat-scroll" id="zScroll">
            ${thread().length ? thread().map(bubbleHTML).join('') : welcomeHTML()}
          </div>

          <div>${composerHTML('zInput')}</div>
        </div>
      </div>`;

    const scroll = root.querySelector('#zScroll');
    // Rebind: composer appends into the scroller itself
    const wrap = root.querySelector('.ai-composer').parentElement;
    bindComposer(wrap, () => ({ roomId: Router.current?.name === 'room' ? Router.current.params[0] : null }), scroll);

    root.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      handleUserInput(b.dataset.q, scroll, () => ({ roomId: null }), scroll);
    }));

    root.querySelector('#zClear').addEventListener('click', async () => {
      if (await UI.confirm({ title: 'Start fresh?', body: 'This clears your conversation with Zephyr.', okLabel: 'Clear', danger: true })) {
        Store.state.meta.zephyrThread = [];
        Store.save();
        renderPanel(root);
      }
    });

    // welcome tool cards clickable
    scroll.querySelectorAll('[data-welcome-q]').forEach(b => b.addEventListener('click', () => {
      handleUserInput(b.dataset.welcomeQ, scroll, () => ({}), scroll);
    }));
    scrollBottom(scroll);
  }

  function welcomeHTML() {
    return `<div class="ai-msg">
      <div class="ai-av">${IDENTITY.avatar}</div>
      <div class="ai-bubble2">
        <div class="ai-tag">Zephyr</div>
        Hey ${U.esc(Store.me()?.displayName || 'drifter')} 👋 I'm <b>Zephyr</b>, woven into every corner of Drift.
        I can recap busy rooms, break the ice, translate, rewrite drafts, debug code and more.
        Try one of these:
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.7rem;">
          <button class="chip" data-welcome-q="summarize this room">🧠 Summarize my favorite room</button>
          <button class="chip" data-welcome-q="suggest topics">💡 Break the ice</button>
          <button class="chip" data-welcome-q="who are you">👋 Who are you?</button>
          <button class="chip" data-welcome-q="12*(34+8)">🧮 Quick math</button>
        </div>
      </div>
    </div>`;
  }

  /* --------------------------- In-room drawer --------------------------- */
  function openDrawer(roomId) {
    const room = Store.getRoom(roomId);
    const drawer = UI.openModal({
      drawer: true,
      title: `${IDENTITY.avatar} Zephyr <span class="badge badge-ai" style="margin-left:.4rem;">AI</span>`,
      body: `<div id="zdThread" style="display:flex;flex-direction:column;gap:.8rem;">${
        thread().length ? '' : `<div class="ai-bubble2" style="border-radius:16px;"><b>Context loaded:</b> #${U.esc(room.name)}. Ask me to <b>summarize</b>, <b>explain</b> the latest messages, suggest <b>topics</b>, or anything else.</div>`}</div>`,
    });
    const body = drawer.card.querySelector('#zdThread');
    thread().forEach(t => body.insertAdjacentHTML('beforeend', bubbleHTML(t)));

    // Composer lives under the thread
    const compWrap = U.el('div');
    compWrap.innerHTML = composerHTML('zdInput');
    drawer.card.appendChild(compWrap);
    bindComposer(compWrap, () => ({
      roomId,
      roomContext: { room: room.name, recent: recentMessages(roomId, 10).map(m => ({ user: Store.getUser(m.userId)?.username, text: m.text })) },
      lastMessage: recentMessages(roomId, 10).slice(-1)[0]
    }), body);
    scrollBottom(body);
  }

  return { IDENTITY, respond, openDrawer, renderPanel, roomDescription, summarizeRoom };
})();
