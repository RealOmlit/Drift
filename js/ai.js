/* ==========================================================================
   Zeek · ai.js — "Zeek AI", Zeek's built-in AI companion.
   ───────────────────────────────────────────────────────────────────────────
   Two layers:
   1) RemoteAI  → OpenAI-compatible chat completions (AIML API by default).
                  Configure via ZeekConfig.AI_BASE_URL / AI_MODEL /
                  AI_API_KEY, or point AI_PROXY_URL at your own secure proxy
                  ({ messages, persona } → { text }).
   2) LocalEngine → keyword-rules fallback used only when no key is set.
   When a remote call FAILS (out of funds, bad model…), Zeek AI says so
   honestly instead of pretending.
   ========================================================================== */

window.AI = (() => {
  'use strict';
  const CFG = window.ZeekConfig;

  const IDENTITY = {
    name: 'Zeek AI',
    role: 'Zeek\'s resident AI companion',
    avatar: '✨'
  };

  const remoteConfigured = () =>
    !!(CFG.AI_ENABLED && (CFG.AI_KEYLESS || effectiveKey() || CFG.AI_PROXY_URL));

  /* Personal API key — pasted in Settings → Zeek AI AI, kept in this browser
     only. config.js AI_API_KEY (if ever set) takes precedence for everyone. */
  const KEY_LS = () => CFG.STORAGE_PREFIX + 'aiKey';
  function storedKey() {
    try { return localStorage.getItem(KEY_LS()) || ''; } catch (e) { return ''; }
  }
  function setStoredKey(k) {
    try {
      if (k) localStorage.setItem(KEY_LS(), k.trim());
      else localStorage.removeItem(KEY_LS());
    } catch (e) {}
  }
  const effectiveKey = () => CFG.AI_API_KEY || storedKey();

/* =====================================================================
    REMOTE INTEGRATION LAYER
    a) AI_PROXY_URL set    → POST { messages, persona, context? } → { text }
    b) AI_API_KEY set      → direct OpenAI-compatible /chat/completions
       Supports any OpenAI-compatible API: AIML API, OpenAI, Together.ai,
       Groq, Ollama, LM Studio, LocalAI, etc.
    ====================================================================== */
  const PERSONAS = {
    friendly: 'You are Zeek AI, the friendly resident AI companion inside a chat app called Zeek. Warm, upbeat and genuinely helpful. Use light markdown (**bold**, `code`, bullet lists) where it helps.',
    concise:  'You are Zeek AI, an AI companion in a chat app. Answer in at most 2-3 short sentences unless asked for detail. Skip filler.',
    playful:  'You are Zeek AI, a witty AI companion in a chat app. Playful, emoji-friendly, but still useful first.'
  };

  function buildMessages(input, ctx = {}) {
    const msgs = [];
    let sys = PERSONAS[Store.state.settings.aiPersona] || PERSONAS.friendly;
    if (ctx.roomContext?.room) {
      sys += `\nYou are chatting inside the room "#${ctx.roomContext.room}".`;
      if (Array.isArray(ctx.roomContext.recent) && ctx.roomContext.recent.length) {
        sys += '\nRecent messages for context:\n' + ctx.roomContext.recent
          .map(m => `${m.user}: ${String(m.text).slice(0, 120)}`).join('\n');
      }
    }
    msgs.push({ role: 'system', content: sys });
    // Continuity: replay the last few turns of this thread
    thread().slice(-8).forEach(t =>
      msgs.push({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }));
    msgs.push({ role: 'user', content: input });
    return msgs;
  }

  async function chatComplete(messages) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    
    // Build request based on format
    let url = CFG.AI_BASE_URL;
    const headers = { 'Content-Type': 'application/json' };
    
    // Add API key if available
    const key = effectiveKey();
    if (key) headers.Authorization = 'Bearer ' + key;
    
    // Add custom headers
    if (CFG.AI_CUSTOM_HEADERS) {
      Object.assign(headers, CFG.AI_CUSTOM_HEADERS);
    }
    
    // Handle different API formats
    let body;
    if (CFG.AI_REQUEST_FORMAT === 'azure') {
      // Azure OpenAI format: /openai/deployments/{model}/chat/completions?api-version=...
      url = CFG.AI_BASE_URL.replace(/\/+$/, '') + '/openai/deployments/' + CFG.AI_MODEL + '/chat/completions?api-version=2024-02-15-preview';
      body = JSON.stringify({ messages, max_tokens: CFG.AI_MAX_TOKENS, temperature: CFG.AI_TEMPERATURE });
    } else if (CFG.AI_REQUEST_FORMAT === 'custom') {
      // Custom format - use base URL as-is
      body = JSON.stringify({ model: CFG.AI_MODEL, messages, max_tokens: CFG.AI_MAX_TOKENS, temperature: CFG.AI_TEMPERATURE });
    } else {
      // Standard OpenAI format
      const isKeyless = CFG.AI_KEYLESS && !key;
      if (isKeyless && CFG.AI_BASE_URL.includes('pollinations.ai')) {
        // Pollinations keyless endpoint
        url = CFG.AI_BASE_URL;
      } else {
        url = CFG.AI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
      }
      body = JSON.stringify({ model: CFG.AI_MODEL, messages, max_tokens: CFG.AI_MAX_TOKENS, temperature: CFG.AI_TEMPERATURE });
    }
    
    try {
      const resp = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers,
        body
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        // Surface errors honestly (funds, rate limit, model…)
        const msg = data?.error?.message || data?.message ||
          `API error ${resp.status}: ${resp.statusText}`;
        throw new Error(msg);
      }
      // Handle different response formats
      let out = null;
      if (data?.choices?.[0]?.message?.content) {
        out = data.choices[0].message.content.trim();
      } else if (data?.choices?.[0]?.text) {
        // Some APIs return text directly
        out = data.choices[0].text.trim();
      } else if (data?.text) {
        // Proxy format
        out = data.text.trim();
      }
      // Qwen-family models sometimes leak hidden reasoning — strip it.
      if (out) out = out.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      return out || null;
    } finally {
      clearTimeout(timer);
    }
  }

  function remoteComplete(messages, ctx) {
    return new Promise(resolve => {
      if (!CFG.AI_PROXY_URL) { resolve(null); return; }
      fetch(CFG.AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          persona: Store.state.settings.aiPersona,
          context: Store.state.settings.aiContext ? ctx : null
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
    return `**Offline translation (${lang === 'fr' ? 'French' : 'Spanish'}):**\n"${words}"\n\n_This built-in dictionary handles common words only. Add an API key in \`js/config.js\` for full-quality translation._`;
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
      general: [`A warm corner of Zeek for ${name} — pull up a chair and make yourself at home.`, `Where the ${name} crowd gathers: good chats, zero pressure.`],
      gaming: [`Squad finder and victory-lap zone for ${name} fans. Salt levels moderated.`, `${name} mains unite — clips, strats and LFG threads daily.`],
      coding: [`${name}: ship talk, stack debates and rubber-duck sessions for builders.`, `Debug together, deploy happy. ${name} is our craft corner.`],
      study: [`${name} — quiet focus, loud wins. Timers on, phones down.`, `Body-doubling central: ${name} edition.`],
      music: [`${name} radio, always on. Share tracks, trade playlists.`, `For the ${name} obsessed — headphones recommended.`],
      memes: [`${name}: premium nonsense, curated daily.`, `Certified fresh takes and stale jokes, recycled responsibly at ${name}.`],
      sports: [`${name} matchday HQ — roar responsibly.`, `Scores, stories and strategic suffering at ${name}.`],
      technology: [`${name}: tomorrow's news, discussed today.`, `Signals over noise — ${name} tracks what's actually next.`],
      design: [`${name} — pixels, type and honest critique.`, `Craft club for ${name}: process over polish.`],
      random: [`${name}: exactly what it says on the tin.`, `No theme. No rules* (*two rules). Welcome to ${name}.`]
    }[category] || [`A space for ${name} on Zeek.`];
    return U.rand(T);
  }

  function moderationHelp() {
    return '**Moderation toolkit:**\n• **Prevent:** clear pinned rules + slow mode during spikes\n• **Detect:** watch report queue; repeated offenders get muted before bans\n• **De-escalate:** address behavior, not identity; take it private when heated\n• **Document:** reports keep context for future mods\nIn Zeek: room settings → Moderators & safety. I can draft rule text too — just ask!';
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
    if (/who are you|what are you|about you/.test(ql)) return `I'm **Zeek AI** — ${IDENTITY.role}. I live inside Zeek: summaries, translations, icebreakers, math emergencies (` + '`12*(34+8)`' + '), code saves and vibe checks. Ask away!';
    if (/help|what can you do/.test(ql)) return '**Things I\'m good at:**\n• `summarize this room` — instant recap\n• `suggest topics` — kill the silence\n• `translate <text>` — ES/FR\n• `rewrite: <message>` — polish any draft\n• `generate a room description`\n• code help, moderation advice, quick math\n\nAdd an API key in `js/config.js` and I get full conversational powers on top of these.';
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

  /** Main entry: returns a Promise<string>. Remote first; local only when unconfigured. */
  async function respond(input, ctx = {}) {
    if (remoteConfigured()) {
      let lastErr = null;
      // Free community endpoints occasionally throttle — one quiet retry.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          let text = null;
          if (CFG.AI_PROXY_URL) {
            text = await remoteComplete([{ role: 'user', content: input }], ctx.roomContext);
          } else {
            text = await chatComplete(buildMessages(input, ctx));
          }
          if (text) return persona(text);
          break;
        } catch (e) {
          lastErr = e;
          if (attempt === 0) await new Promise(r => setTimeout(r, 1300));
        }
      }
      // Honest failure — no fake fallbacks when an API is configured.
      const msg = lastErr?.message || 'Unknown error';
      const hint = /funds|insufficient|billing|Payment Required|402/i.test(msg)
        ? ' The AI endpoint is rate-limiting or out of credits — try again in a minute.'
        : '';
      return `⚠️ **Zeek AI can't reach its AI backend right now.**\n${msg}.${hint}`;
    }
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
      <div class="ai-av">${IDENTITY.avatar}<span class="z-shimmer" aria-hidden="true"></span></div>
      <div class="ai-bubble2"><div class="ai-tag z-tag-glow">Zeek AI</div>${mdLite(turn.text)}</div>
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
        <textarea id="${id}" rows="1" placeholder="Ask Zeek AI anything…"></textarea>
        <button class="ai-send" data-send aria-label="Send">${U.icon('send', 18)}</button>
      </div>
      <div class="small faint" style="margin-top:.5rem;display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
        ${U.icon('info', 13)} ${remoteConfigured()
          ? `Live: <b class="mono">${U.esc(CFG.AI_MODEL)}</b> · ${U.esc(new URL(CFG.AI_BASE_URL).host)} <span style="display:inline-flex;align-items:center;gap:.28rem;margin-left:.35rem;padding:.12rem .45rem;border-radius:99px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.22);color:var(--ok);font-weight:700;font-size:.7rem;">● live</span>`
          : 'Offline rule engine · add your API key in <b>Settings → Zeek AI AI</b> for full power'}
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
    // premium thinking indicator — animated Zeek AI avatar + orbital dots + wave
    const typing = U.el('div', { class: 'ai-msg ai-thinking' });
    typing.innerHTML = `<div class="ai-av z-think-av"><span class="z-orb-ring" aria-hidden="true"></span><span class="z-orb-core">${IDENTITY.avatar}</span></div><div class="ai-bubble2 z-think-bubble"><div class="z-thinking-head"><span class="ai-tag z-tag-glow">Zeek AI</span><span class="z-think-label">thinking</span></div><div class="z-dots" aria-hidden="true"><span></span><span></span><span></span></div><div class="z-think-sub">weaving a reply…</div></div>`;
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
    const live = remoteConfigured();
    root.innerHTML = `
      <div class="view-inner" style="max-width:860px;">
        <div class="ai-wrap">
          <div class="z-hero">
            <div class="z-hero-left">
              <div class="z-avatar-wrap">
                <span class="z-avatar-ring" aria-hidden="true"></span>
                <div class="z-avatar">${IDENTITY.avatar}<span class="z-shimmer" aria-hidden="true"></span></div>
                <span class="z-status-dot" title="${live ? 'Live — ready' : 'Offline engine'}"></span>
              </div>
              <div>
                <h1><span class="z-name-grad">Zeek AI</span> <span class="z-badge-live">${live ? 'Live' : 'Offline'}</span></h1>
                <div class="z-meta">${IDENTITY.role} <span class="z-sep"></span> <b>${U.esc(Store.state.settings.aiPersona)}</b> persona <span class="z-sep"></span> <span style="display:inline-flex;align-items:center;gap:.3rem;">${U.icon('sparkles', 12)} ${live ? U.esc(CFG.AI_MODEL) : 'rule engine'}</span></div>
              </div>
            </div>
            <div class="z-hero-actions">
              <button class="btn btn-glass btn-sm" id="zClear">${U.icon('refresh', 14)} New chat</button>
            </div>
          </div>

          <div class="ai-tools">
            ${QUICK_TOOLS.map(([q, ic, label]) => `<button class="ai-tool-chip" data-q="${U.esc(q)}">${U.icon(ic, 14)} ${label}</button>`).join('')}
          </div>

          <div class="ai-chat-scroll" id="zScroll">
            ${thread().length ? thread().map(bubbleHTML).join('') : welcomeHTML()}
          </div>

          <div style="padding-top:.7rem;">${composerHTML('zInput')}</div>
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
      if (await UI.confirm({ title: 'Start fresh?', body: 'This clears your conversation with Zeek AI.', okLabel: 'Clear', danger: true })) {
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
    return `<div class="z-welcome">
        <div style="display:flex;gap:.85rem;align-items:flex-start;">
          <div class="z-avatar" style="width:42px;height:42px;border-radius:13px;font-size:1.2rem;flex:none;animation: z-breathe 3s ease-in-out infinite, z-glow 3s ease-in-out infinite;">${IDENTITY.avatar}<span class="z-shimmer" aria-hidden="true"></span></div>
          <div style="flex:1;min-width:0;">
            <div class="ai-tag z-tag-glow" style="margin-bottom:.28rem;">Zeek AI · ${IDENTITY.role}</div>
            <div style="font-size:.94rem;line-height:1.6;">Hey ${U.esc(Store.me()?.displayName || 'drifter')} 👋 I'm <b>Zeek AI</b>, woven into every corner of Zeek. I recap busy rooms, break the ice, translate, rewrite drafts, debug code and more.</div>
            <div class="z-welcome-actions">
              <button class="chip" data-welcome-q="summarize this room">🧠 Summarize</button>
              <button class="chip" data-welcome-q="suggest topics">💡 Icebreakers</button>
              <button class="chip" data-welcome-q="who are you">👋 About me</button>
              <button class="chip" data-welcome-q="12*(34+8)">🧮 Quick math</button>
            </div>
          </div>
        </div>
      </div>
      <div class="small faint" style="display:flex;align-items:center;gap:.35rem;padding:.15rem .2rem;">${U.icon('info', 12)} Try “summarize this room” or “rewrite: thanks for the update”</div>`;
  }

  /* --------------------------- In-room drawer --------------------------- */
  function openDrawer(roomId) {
    const room = Store.getRoom(roomId);
    const live = remoteConfigured();
    const drawer = UI.openModal({
      drawer: true,
      title: `<span style="display:inline-flex;align-items:center;gap:.55rem;"><span style="width:28px;height:28px;border-radius:9px;display:inline-grid;place-items:center;background:var(--grad);color:#fff;font-size:.95rem;position:relative;overflow:hidden;box-shadow:0 4px 12px -4px var(--ring);">${IDENTITY.avatar}<span class="z-shimmer" aria-hidden="true"></span></span> Zeek AI <span class="z-badge-live" style="font-size:.6rem;padding:.14rem .4rem;">${live ? 'Live' : 'Offline'}</span></span>`,
      body: `<div id="zdThread" style="display:flex;flex-direction:column;gap:.85rem;">${
        thread().length ? '' : `<div class="z-welcome" style="padding:.85rem 1rem;"><div class="ai-tag z-tag-glow" style="margin-bottom:.3rem;">Context loaded · #${U.esc(room.name)}</div><div style="font-size:.88rem;line-height:1.5;">Ask me to <b>summarize</b>, <b>explain</b> the latest messages, suggest <b>topics</b>, or anything else.</div><div class="z-welcome-actions" style="margin-top:.6rem;"><button class="chip" data-welcome-q="summarize this room">🧠 Summarize</button><button class="chip" data-welcome-q="explain the latest messages">🔍 Explain</button><button class="chip" data-welcome-q="suggest topics">💡 Topics</button></div></div>`}</div>`,
    });
    const body = drawer.card.querySelector('#zdThread');
    thread().forEach(t => body.insertAdjacentHTML('beforeend', bubbleHTML(t)));
    // welcome chips in drawer should also trigger
    body.querySelectorAll('[data-welcome-q]').forEach(b => b.addEventListener('click', () => {
      handleUserInput(b.dataset.welcomeQ, body, () => ({
        roomId,
        roomContext: { room: room.name, recent: recentMessages(roomId, 10).map(m => ({ user: Store.getUser(m.userId)?.username, text: m.text })) },
        lastMessage: recentMessages(roomId, 10).slice(-1)[0]
      }), body);
    }));

    // Composer lives under the thread
    const compWrap = U.el('div');
    compWrap.style.cssText = 'padding:1rem 1rem .9rem;border-top:1px solid var(--brd-1);background:color-mix(in srgb, var(--bg1) 92%, var(--glass));';
    compWrap.innerHTML = composerHTML('zdInput');
    drawer.card.appendChild(compWrap);
    bindComposer(compWrap, () => ({
      roomId,
      roomContext: { room: room.name, recent: recentMessages(roomId, 10).map(m => ({ user: Store.getUser(m.userId)?.username, text: m.text })) },
      lastMessage: recentMessages(roomId, 10).slice(-1)[0]
    }), body);
    scrollBottom(body);
  }

  return { IDENTITY, respond, openDrawer, renderPanel, roomDescription, summarizeRoom, remoteConfigured, storedKey, setStoredKey };
})();
