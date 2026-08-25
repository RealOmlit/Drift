/* ==========================================================================
   Drift · chat.js — the room view: messages, composer, reactions, replies,
   pins, polls, mentions, typing indicators, in-room search, right panel.
   ========================================================================== */

window.Chat = (() => {
  'use strict';

  let roomId = null;
  let unsubs = [];
  let replyTo = null;          // { id, author, snippet }
  let editingId = null;
  let lastSendTs = 0;
  let typingSet = new Map();   // userId → auto-clear timeout
  let atBottom = true;
  let newCount = 0;

  const me = () => Store.me();
  const room = () => Store.getRoom(roomId);
  const scrollEl = () => U.$('#msgScroll');

  /* =====================================================================
     Text formatting — escape first, then enrich
  ===================================================================== */
  function fmtInline(seg) {
    let s = U.esc(seg);
    s = s.replace(/(https?:\/\/[^\s<]+)/g, m => {
      const label = m.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      return `<a href="${m}" target="_blank" rel="noopener noreferrer">${U.esc(label)}</a>`;
    });
    const myName = me()?.username.toLowerCase();
    s = s.replace(/(^|\s)@([a-z0-9_]{3,20})/gi, (m, p, u) =>
      `${p}<span class="mention ${u.toLowerCase() === myName ? 'me' : ''}" data-mention="${u.toLowerCase()}">@${u}</span>`);
    s = s.replace(/(^|\s)(#[a-z0-9_-]{2,30})\b/gi, '$1<span class="hashtag">$2</span>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return s.replace(/\n/g, '<br>');
  }
  function fmtText(raw) {
    // ``` fenced code blocks survive as <pre>
    return String(raw).split(/```(?:[a-z]*\n)?/i)
      .map((seg, i) => i % 2 ? `<pre style="background:var(--bg0);border:1px solid var(--brd-1);padding:.7rem .85rem;border-radius:11px;overflow-x:auto;font-family:var(--mono);font-size:.8rem;margin:.4rem 0;">${U.esc(seg.trim())}</pre>` : fmtInline(seg))
      .join('');
  }

  /* =====================================================================
     Mount / unmount
  ===================================================================== */
  function mount(root, id) {
    unmount();
    roomId = id;
    const r = room();
    if (!r) { Router.go('home'); return; }

    if (r.visibility === 'private' && !Rooms.isJoined(r)) {
      Rooms.joinRoom(id).then(ok => ok ? mount(root, id) : Router.go('discover'));
      return;
    }
    if (r.visibility === 'public' && !Rooms.isJoined(r)) {
      // Public rooms can be previewed read-only until joined? Keep simple: join silently.
      r.members.push('me'); r.memberCount += 1; Store.save();
    }

    root.innerHTML = layoutHTML(r);
    bindShell();
    renderAllMessages(true);
    renderPinnedBar();
    updateTypingRow();

    // Bus subscriptions
    unsubs.push(
      Store.on('msg:new', onMsgNew),
      Store.on('msg:update', onMsgUpdate),
      Store.on('typing', onTyping),
      Store.on('typing-stop', onTypingStop),
      Store.on('room:update', onRoomUpdate),
      Store.on('presence', updateOnlineSub)
    );

    // Mark read after paint so unread logic sees the visit
    setTimeout(() => { me().reads[roomId] = Date.now(); Store.save(); }, 400);
    window.AppShell?.setRailActive?.('rooms');
  }

  function unmount() {
    unsubs.forEach(fn => fn()); unsubs = [];
    roomId = null; replyTo = null; editingId = null;
    typingSet.clear(); document.body.classList.remove('focus-mode');
  }

  function rerender() {
    if (!roomId) return;
    const root = U.$('#view');
    if (root && Router.current?.name === 'room') mount(root, roomId);
  }

  /* =====================================================================
     Layout
  ===================================================================== */
  function layoutHTML(r) {
    const c = Rooms.catOf(r.category);
    return `
    <div class="room-view" id="roomView">
      <div class="room-main">
        <header class="room-head">
          <button class="icon-btn hide-d" id="btnBack">${U.icon('arrow-left', 19)}</button>
          <div class="rh-icon" style="--rc-bg:${c.grad}">${r.visibility === 'private' ? U.icon('lock', 19) : r.icon}</div>
          <div class="grow" style="min-width:0;">
            <h2>${U.esc(r.name)} ${r.visibility === 'private' ? U.icon('lock', 13) : ''}</h2>
            <div class="rh-sub">
              <span class="mem-count" data-jump-members>${U.fmtCount(r.memberCount)} members</span>
              <span>·</span>
              <span data-online-sub>— online here</span>
              ${r.slowMode ? `<span class="badge badge-hot">🐢 slow ${r.slowMode}s</span>` : ''}
            </div>
          </div>
          <div class="rh-actions">
            <button class="icon-btn hide-m" id="btnSearchInRoom" data-tip="Search in room">${U.icon('search', 18)}</button>
            <button class="icon-btn hide-m" id="btnFocus" data-tip="Focus mode">${U.icon('zap', 18)}</button>
            <button class="ai-ask-btn hide-m" id="btnAIDrawer">✨ Ask Zephyr</button>
            <button class="icon-btn" id="btnRightPanel" title="Info panel">${U.icon('info', 18)}</button>
            <button class="icon-btn" id="btnRoomMenu">${U.icon('dots', 18)}</button>
          </div>
        </header>

        <div class="pin-bar hide" id="pinBar"></div>
        <div class="msg-scroll" id="msgScroll"><div id="msgList"></div></div>

        <div class="typing-row" id="typingRow"></div>

        <div class="composer-zone">
          <div id="replyChipWrap"></div>
          <div class="composer" id="composerBox">
            <button class="c-btn" id="btnEmoji" data-tip="Emoji">${U.icon('smile', 20)}</button>
            <textarea id="msgInput" rows="1" placeholder="Message ${U.esc(r.name)}…" autocomplete="off"></textarea>
            <button class="c-btn" id="btnPoll" data-tip="Instant poll">${U.icon('chart', 19)}</button>
            <button class="c-btn" id="btnActivity" data-tip="Mini activity">${U.icon('gamepad', 20)}</button>
            <button class="ai-ask-btn" id="btnAskAIInline">✨ AI</button>
            <button class="send-btn" id="btnSend" aria-label="Send">${U.icon('send', 18)}</button>
          </div>
          <div class="slowmo-note hide" id="slowmoNote"></div>
        </div>
      </div>

      <aside class="room-right" id="roomRight">
        <div class="rr-tabs">
          <button class="rr-tab on" data-tab="about">${U.icon('info', 15)} About</button>
          <button class="rr-tab" data-tab="members">${U.icon('users', 15)} Members</button>
          <button class="rr-tab" data-tab="pins">${U.icon('pin', 15)} Pins</button>
          <button class="rr-tab" data-tab="tools">${U.icon('sparkles', 15)} Tools</button>
        </div>
        <div class="rr-body" id="rrBody"></div>
      </aside>
    </div>`;
  }

  /* =====================================================================
     Shell events (header, composer, tabs)
  ===================================================================== */
  function bindShell() {
    const $ = sel => U.$(sel);

    $('#btnBack')?.addEventListener('click', () => history.back());
    $('#btnSearchInRoom')?.addEventListener('click', toggleRoomSearch);
    $('#btnFocus')?.addEventListener('click', e => {
      document.body.classList.toggle('focus-mode');
      e.currentTarget.classList.toggle('active');
    });
    $('#btnAIDrawer')?.addEventListener('click', () => AI.openDrawer(roomId));
    $('#btnAskAIInline').addEventListener('click', () => AI.openDrawer(roomId));
    $('#btnRightPanel').addEventListener('click', () => {
      const v = $('#roomView');
      v.classList.contains('right-open') && innerWidth <= 1024
        ? v.classList.remove('right-open')
        : v.classList.add('right-open');
    });
    $('[data-jump-members]').addEventListener('click', () => switchTab('members'));

    $('#btnRoomMenu').addEventListener('click', e => {
      const r = room();
      UI.menu(e.currentTarget, [
        { header: true, label: r.name },
        { label: '✨ Zephyr tools', icon: 'sparkles', onClick: () => switchTab('tools') },
        { label: 'Room rules', icon: 'shield', onClick: showRules },
        { label: 'Copy invite link', icon: 'copy', onClick: async () => {
            await UI.copyText(`${location.origin}${location.pathname}#/room/${r.id}`);
            UI.toast({ title: 'Invite link copied', type: 'ok', icon: 'copy' });
          } },
        ...(r.privateCode ? [{ label: `Invite code: ${r.privateCode}`, icon: 'lock', onClick: async () => { await UI.copyText(r.privateCode); UI.toast({ title: 'Code copied', type: 'ok' }); } }] : []),
        { sepBefore: true, label: 'Room settings', icon: 'gear', onClick: () => Rooms.settingsModal(roomId) },
        ...(Rooms.isJoined(r) && !Rooms.isOwner(r) ? [{ label: 'Leave room', icon: 'logout', danger: true, onClick: () => Rooms.leaveRoom(roomId) }] : [])
      ]);
    });

    // Composer
    const ta = $('#msgInput');
    ta.addEventListener('input', () => {
      autosize(ta);
      mentionCheck(ta);
      Backend.sendTyping(roomId);
    });
    ta.addEventListener('keydown', e => {
      if (mentionNav(e)) return;
      if (e.key === 'Enter' && !e.shiftKey && Store.state.settings.enterToSend) { e.preventDefault(); sendCurrent(); }
      if (e.key === 'Escape' && replyTo) setReply(null);
    });
    $('#btnSend').addEventListener('click', sendCurrent);
    $('#btnEmoji').addEventListener('click', e => {
      UI.emojiPicker(e.currentTarget, em => insertAtCaret(ta, em));
    });
    $('#btnPoll').addEventListener('click', () => pollBuilder());
    $('#btnActivity').addEventListener('click', e => Activities.menu(e.currentTarget, roomId));

    // Right panel tabs
    U.$('.rr-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      switchTab(b.dataset.tab);
    });
    drawRightPanel('about');

    // Message list delegation (one listener for everything inside messages)
    scrollEl().addEventListener('scroll', () => {
      const el = scrollEl();
      const wasAtBottom = atBottom;
      atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
      if (atBottom && !wasAtBottom) { newCount = 0; U.$('#newPill')?.remove(); }
    });
    scrollEl().addEventListener('click', onListClick);
  }

  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(150, ta.scrollHeight) + 'px'; }

  function insertAtCaret(ta, text) {
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? s;
    ta.value = ta.value.slice(0, s) + text + (ta.value.slice(e).startsWith(' ') ? '' : ' ') + ta.value.slice(e);
    const pos = s + text.length + 1;
    ta.setSelectionRange(pos, pos);
    ta.focus();
  }

  /* ------------------------------ sending ------------------------------ */
  function sendCurrent() {
    const ta = U.$('#msgInput');
    const text = ta.value.trim();
    if (!text || !roomId) return;

    // Slow mode gate
    const r = room();
    if (r.slowMode > 0 && !Rooms.isMod(r)) {
      const wait = r.slowMode * 1000 - (Date.now() - lastSendTs);
      if (wait > 0) {
        UI.toast({ title: 'Slow mode is on 🐢', body: `Wait ${Math.ceil(wait / 1000)}s between messages.`, type: 'warn', icon: 'clock' });
        return;
      }
    }

    Store.composeMessage(roomId, 'me', text, { replyTo: replyTo?.id || null });
    lastSendTs = Date.now();
    me().stats.msgs++;
    Store.questProgress('send');
    Store.addXP(5, 'Message sent');

    // Mention notifications for people I tagged
    [...text.matchAll(/@([a-z0-9_]{3,20})/gi)].forEach(mm => {
      const bot = DemoData.users.find(u => u.username.toLowerCase() === mm[1].toLowerCase());
      if (bot) setTimeout(() => Notifs.push('message', { title: `${bot.displayName} saw your mention`, body: `In #${r.name}`, actorId: bot.id, roomId }), U.randInt(6000, 14000));
    });

    ta.value = ''; autosize(ta);
    setReply(null);
    atBottom = true; scrollToBottom(true);
  }

  function setReply(target) {
    replyTo = target;
    const wrap = U.$('#replyChipWrap');
    if (!wrap) return;
    wrap.innerHTML = target ? `
      <div class="reply-chip">
        ${U.icon('reply', 14)}
        <span><b style="color:var(--ac2)">${U.esc(target.author)}</b> ${U.esc(target.snippet.slice(0, 70))}${target.snippet.length > 70 ? '…' : ''}</span>
        <button class="icon-btn sm" id="cancelReply" style="margin-left:auto;">${U.icon('x', 13)}</button>
      </div>` : '';
    U.$('#cancelReply')?.addEventListener('click', () => setReply(null));
    U.$('#msgInput')?.focus();
  }

  /* ------------------------ mention autocomplete ------------------------ */
  let mentionState = null; // { items, index, start }
  function mentionCheck(ta) {
    const upto = ta.value.slice(0, ta.selectionStart);
    const m = upto.match(/(^|\s)@([a-z0-9_]*)$/i);
    closeMentionPop();
    if (!m) return;
    const q = m[2].toLowerCase();
    const members = room().members.map(id => Store.getUser(id)).filter(Boolean);
    const items = members.filter(u => u.username.toLowerCase().startsWith(q)).slice(0, 6);
    if (!items.length) return;
    mentionState = { items, index: 0 };
    const pop = U.el('div', { class: 'mention-pop', id: 'mentionPop' });
    pop.innerHTML = items.map((u, i) => `
      <button data-i="${i}" class="${i === 0 ? 'sel' : ''}">
        ${U.avatar(u, { size: 26 })}
        <span class="mp-n">${U.esc(u.displayName)}</span>
        <span class="small faint">@${U.esc(u.username)}</span>
      </button>`).join('');
    document.body.appendChild(pop);
    const r = ta.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.top = Math.max(10, r.top - pop.offsetHeight - 8) + 'px';
    pop.addEventListener('mousedown', e => {
      const b = e.target.closest('[data-i]');
      if (b) { e.preventDefault(); pickMention(items[+b.dataset.i]); }
    });
  }
  function pickMention(u) {
    const ta = U.$('#msgInput');
    const caret = ta.selectionStart;
    const before = ta.value.slice(0, caret).replace(/@([a-z0-9_]*)$/i, `@${u.username} `);
    ta.value = before + ta.value.slice(caret);
    closeMentionPop();
    ta.focus();
  }
  function closeMentionPop() { U.$('#mentionPop')?.remove(); if (mentionState) mentionState.index = -1; mentionState = null; }
  /** Returns true when the key was consumed by the mention popup. */
  function mentionNav(e) {
    const pop = U.$('#mentionPop');
    if (!pop || !mentionState) return false;
    const rows = [...pop.querySelectorAll('button')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      mentionState.index = (mentionState.index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('sel', i === mentionState.index));
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !Store.state.settings.enterToSend)) {
      e.preventDefault(); pickMention(mentionState.items[mentionState.index]); return true;
    }
    if (e.key === 'Escape') { closeMentionPop(); return true; }
    return false;
  }

  /* =====================================================================
     Rendering messages
  ===================================================================== */
  const QUICK_REACTIONS = ['👍', '❤️', '😂', '🤯', '💡', '🤝', '🔥'];
  const REACTION_EXTRA = ['🎉', '😮', '😢', '🙏', '👀', '💯', '⚡', '🏆', '😅', '🤔', '🙌', '💚', '⭐', '🚀', '💀', '🍕'];

  function renderAllMessages(initial) {
    const listEl = U.$('#msgList'); if (!listEl) return;
    const msgs = Store.roomMessages(roomId);
    let html = '', lastTs = 0, lastUser = null, lastDay = '';
    msgs.forEach(m => {
      const day = U.fmtDayDivider(m.ts);
      if (day !== lastDay) { html += `<div class="msg-day"><span>${day}</span></div>`; lastDay = day; lastUser = null; }
      html += messageHTML(m, { grouped: lastUser === m.userId && m.ts - lastTs < 5 * 60e3 && m.type === 'text' });
      lastTs = m.ts; lastUser = m.userId;
    });
    listEl.innerHTML = html || emptyRoomHTML();
    scrollToBottom(!initial);
  }

  function emptyRoomHTML() {
    return `<div class="empty" style="margin-top:18vh;"><div class="e-icon">${U.icon('message', 26)}</div>
      <h4>The floor is yours</h4><p>Nobody has said anything yet. Break the ice — or ask Zephyr for topics.</p>
      <button class="btn btn-glass btn-sm" onclick="AI.openDrawer('${roomId}')">✨ Suggest topics</button></div>`;
  }

  function authorOf(m) { return Store.getUser(m.userId); }

  function messageHTML(m, ctx = {}) {
    if (m.deleted) return `
      <div class="msg deleted gap ${ctx.grouped ? 'grouped' : ''}" data-mid="${m.id}">
        <div class="m-side"></div>
        <div class="m-body"><div class="m-text">🚫 This message was removed${m.userId === 'me' ? ' by you' : ' by a moderator'}.</div></div>
      </div>`;

    if (m.type === 'system') {
      return `<div class="sysmsg"><span>${fmtText(m.text)}</span></div>`;
    }

    const u = authorOf(m);
    const mine = m.userId === 'me';

    if (m.type === 'activity') {
      return `
      <div class="msg gap" data-mid="${m.id}">
        <div class="m-side">${u ? U.avatar(u, { size: 34 }) : ''}</div>
        <div class="m-body">
          ${!ctx.grouped ? headHTML(m, u, mine) : ''}
          <div class="act-result">
            <div class="ar-icon">${U.icon('gamepad', 20)}</div>
            <div><div class="ar-t">${U.esc(m.meta?.headline || 'Activity result')}</div>
            <div class="ar-s">${U.esc(m.meta?.detail || '')}</div></div>
          </div>
          ${reactionsHTML(m)}
        </div>
      </div>`;
    }

    if (m.type === 'poll') return pollHTML(m, ctx, u, mine);

    // Regular text message
    const muted = Mod.isMuted(m.userId);
    const blocked = Mod.isBlocked(m.userId);
    const mentionedMe = new RegExp(`@${U.esc(me()?.username || '')}\\b`, 'i').test(m.text);

    const quote = m.replyTo ? (() => {
      const p = Store.roomMessages(roomId).find(x => x.id === m.replyTo);
      if (!p) return '';
      const pu = authorOf(p);
      return `<div class="reply-quote" data-jump="${p.id}">
        <span class="rq-a">${U.esc(pu?.displayName || 'unknown')}</span>
        <span class="rq-t">${U.esc(p.text.slice(0, 80))}</span></div>`;
    })() : '';

    const preview = Store.state.settings.linkPreviews ? linkPreviewHTML(m.text) : '';

    return `
      <div class="msg ${ctx.grouped ? 'grouped' : 'gap'} ${mentionedMe && !mine ? 'mentions-me' : ''} ${muted ? 'dimmed-muted' : ''}" data-mid="${m.id}">
        <div class="m-side">${ctx.grouped ? '' : (blocked ? U.avatar({ username: 'blocked', hue: 0 }, { size: 34 }) : (u ? U.avatar(u, { size: 34 }) : ''))}</div>
        <div class="m-body">
          ${quote}
          ${ctx.grouped ? '' : headHTML(m, blocked ? null : u, mine)}
          <div class="m-text" data-text>${blocked ? '<i>message from a blocked user</i>' : fmtText(m.text)}${m.edited ? '<span class="m-edited">(edited)</span>' : ''}</div>
          ${preview}
          ${reactionsHTML(m)}
        </div>
        ${actionsHTML(m, mine, u)}
      </div>`;
  }

  function headHTML(m, u, mine) {
    const tick = mine && Store.state.settings.readReceipts
      ? `<span class="read-tick ${m.seen ? 'seen' : ''}" data-tick>${U.icon(m.seen ? 'checks' : 'check', 13)}</span>` : '';
    return `<div class="m-head">
      <span class="m-author" data-user-card="${m.userId}">${U.esc(u?.displayName || 'Drift')}</span>
      <span class="m-time">${U.fmtTime(m.ts)} ${tick}</span>
    </div>`;
  }

  function actionsHTML(m, mine, u) {
    const r = room();
    const canModerate = Rooms.isMod(r);
    return `
      <div class="m-actions">
        <button data-act="react" title="React" class="${(m.reactions && Object.values(m.reactions).flat().includes('me')) ? 'react-on' : ''}">${U.icon('smile', 16)}</button>
        <button data-act="reply" title="Reply">${U.icon('reply', 16)}</button>
        ${mine ? `<button data-act="edit" title="Edit">${U.icon('edit', 15)}</button>` : ''}
        ${(mine || canModerate) ? `<button data-act="del" title="Delete">${U.icon('trash', 15)}</button>` : ''}
        <button data-act="pin" title="Pin" class="ma-pin ${(m.pinned) ? 'active' : ''}">${U.icon('pin', 15)}</button>
        <button data-act="copy" title="Copy">${U.icon('copy', 15)}</button>
        ${!mine ? `<button data-act="report" title="Report">${U.icon('flag', 15)}</button>` : ''}
      </div>`;
  }

  function reactionsHTML(m) {
    const entries = Object.entries(m.reactions || {}).filter(([, ids]) => ids.length);
    if (!entries.length) return '';
    return `<div class="reactions">${entries.map(([emj, ids]) => `
      <button class="reaction-pill ${ids.includes('me') ? 'mine' : ''}" data-react="${U.esc(emj)}" title="${U.esc(ids.map(i => Store.getUser(i)?.displayName || 'someone').join(', '))}">
        ${/^[\u0000-\uFFFF]$/.test(emj) || emj.length <= 3 ? emj : `<span class="w-token">${U.esc(emj)}</span>`}
        <b>${ids.length}</b>
      </button>`).join('')}</div>`;
  }

  function pollHTML(m, ctx, u, mine) {
    const opts = m.poll.options;
    const total = opts.reduce((n, o) => n + o.votes.length, 0);
    const myVote = opts.findIndex(o => o.votes.includes('me'));
    const top = Math.max(...opts.map(o => o.votes.length), 1);
    return `
    <div class="msg gap" data-mid="${m.id}">
      <div class="m-side">${u ? U.avatar(u, { size: 34 }) : ''}</div>
      <div class="m-body">
        ${ctx.grouped ? '' : headHTML(m, u, mine)}
        <div class="poll">
          <div class="poll-q">📊 ${U.esc(m.poll.question)}</div>
          ${opts.map((o, i) => {
            const pct = total ? Math.round(o.votes.length / total * 100) : 0;
            return `<button class="poll-opt ${myVote === i ? 'voted' : ''}" data-poll-vote="${i}">
              <span class="po-fill ${o.votes.length >= top && total ? 'win' : ''}" style="--pct:${total ? pct : 0}"></span>
              <span class="po-lbl">${o.votes.includes('me') ? `<span class="po-check">✔ </span>` : ''}${U.esc(o.label)}</span>
              <span class="po-pct">${total ? pct + '%' : ''}</span>
            </button>`;
          }).join('')}
          <div class="poll-meta">${total} vote${total === 1 ? '' : 's'} · ${myVote >= 0 ? 'tap another option to change your vote' : 'tap to vote'}</div>
        </div>
        ${reactionsHTML(m)}
      </div>
      ${actionsHTML(m, mine, u)}
    </div>`;
  }

  function linkPreviewHTML(text) {
    const urlMatch = String(text).match(/https?:\/\/[^\s<]+/);
    if (!urlMatch) return '';
    try {
      const url = new URL(urlMatch[0]);
      const domain = url.hostname.replace(/^www\./, '');
      const seg = url.pathname.split('/').filter(Boolean).pop() || '';
      const title = (seg ? seg.replace(/[-_]+/g, ' ').replace(/\.\w{2,4}$/, '') : domain).slice(0, 48);
      return `<a class="link-preview" href="${U.esc(url.href)}" target="_blank" rel="noopener noreferrer">
        <span class="lp-favicon">${U.esc(domain[0].toUpperCase())}</span>
        <span class="grow"><span class="lp-domain">${U.esc(domain)}</span>
        <span class="lp-title">${U.esc(title)}</span>
        <span class="lp-note">static preview · demo</span></span>
      </a>`;
    } catch (e) { return ''; }
  }

  /* ------------------------- live updates ------------------------- */
  function onMsgNew(msg) {
    if (msg.roomId !== roomId || !U.$('#msgList')) return;
    U.$('#msgList').querySelector('.empty')?.remove();
    const prev = Store.roomMessages(roomId);
    const idx = prev.indexOf(msg);
    const prevMsg = idx > 0 ? prev[idx - 1] : null;
    const dayChanged = !prevMsg || U.fmtDayDivider(prevMsg.ts) !== U.fmtDayDivider(msg.ts);
    const grouped = !dayChanged && prevMsg && prevMsg.userId === msg.userId && msg.type === 'text' && msg.ts - prevMsg.ts < 5 * 60e3;

    if (dayChanged) {
      U.$('#msgList').insertAdjacentHTML('beforeend', `<div class="msg-day"><span>${U.fmtDayDivider(msg.ts)}</span></div>`);
    }
    U.$('#msgList').insertAdjacentHTML('beforeend', messageHTML(msg, { grouped }));

    // Incoming mention of me?
    if (msg.userId !== 'me' && new RegExp(`@${me()?.username}\\b`, 'i').test(msg.text)) {
      Notifs.push('mention', {
        title: `${authorOf(msg)?.displayName} mentioned you`,
        body: msg.text.slice(0, 60), actorId: msg.userId, roomId
      });
    }
    if (atBottom) scrollToBottom(true);
    else {
      newCount++;
      pill();
    }
  }

  function pill() {
    let p = U.$('#newPill');
    if (!p) {
      p = U.el('button', { class: 'btn btn-primary btn-sm new-msgs-pill', id: 'newPill' });
      p.addEventListener('click', () => { atBottom = true; newCount = 0; p.remove(); scrollToBottom(true); });
      U.$('.room-main').appendChild(p);
    }
    p.innerHTML = `${newCount} new message${newCount > 1 ? 's' : ''} ↓`;
  }

  function onMsgUpdate(msg) {
    if (msg.roomId !== roomId) return;
    refreshOne(msg.id);
    renderPinnedBar();
  }

  function refreshOne(msgId) {
    const node = U.$(`#msgList [data-mid="${msgId}"]`);
    const msg = Store.roomMessages(roomId).find(x => x.id === msgId);
    if (!node || !msg) return;
    node.outerHTML = messageHTML(msg, { grouped: node.classList.contains('grouped') });
  }

  function scrollToBottom(smooth) {
    const el = scrollEl(); if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  /* --------------------------- click delegation --------------------------- */
  function onListClick(e) {
    const jump = e.target.closest('[data-jump]');
    if (jump) { jumpTo(jump.dataset.jump); return; }

    const card = e.target.closest('[data-user-card], [data-mention]');
    if (card) {
      const uname = card.dataset.userCard || card.dataset.mention;
      const user = uname === 'me' ? me() : DemoData.users.find(x => x.username.toLowerCase() === uname) || Store.getUser(uname);
      if (user) People.openProfileCard(user.id);
      return;
    }

    const reactBtn = e.target.closest('[data-react]');
    if (reactBtn) {
      const mid = reactBtn.closest('[data-mid]').dataset.mid;
      const added = Store.toggleReaction(roomId, mid, reactBtn.dataset.react, 'me');
      if (added) {
        me().stats.reactionsGiven++;
        Store.addXP(2, 'Reaction');
        Store.questProgress('react');
      }
      return;
    }

    const vote = e.target.closest('[data-poll-vote]');
    if (vote) {
      const mid = vote.closest('[data-mid]').dataset.mid;
      const optIdx = parseInt(vote.dataset.pollVote, 10);
      castVote(mid, optIdx);
      return;
    }

    const act = e.target.closest('[data-act]');
    if (act) handleAction(act, act.closest('[data-mid]')?.dataset.mid);
  }

  function castVote(mid, optIdx) {
    const msg = Store.roomMessages(roomId).find(x => x.id === mid);
    if (!msg || msg.type !== 'poll') return;
    let first = true;
    msg.poll.options.forEach((o, i) => {
      const has = o.votes.includes('me');
      if (has && i !== optIdx) { o.votes.splice(o.votes.indexOf('me'), 1); first = false; }
      else if (has && i === optIdx) first = false;
    });
    msg.poll.options[optIdx].votes.push('me');
    Store.save();
    Store.emit('msg:update', msg);
    if (first) { me().stats.pollsVoted++; Store.addXP(3, 'Poll vote'); Store.questProgress('vote'); }
  }

  function handleAction(btn, mid) {
    const msg = Store.roomMessages(roomId).find(x => x.id === mid);
    if (!msg) return;
    const kind = btn.dataset.act;
    const author = authorOf(msg);

    if (kind === 'react') {
      const rect = btn.getBoundingClientRect();
      openQuickReactions(rect, mid);
    }
    if (kind === 'reply') {
      setReply({ id: msg.id, author: author?.displayName || 'someone', snippet: msg.text });
    }
    if (kind === 'copy') { UI.copyText(msg.text).then(() => UI.toast({ title: 'Copied to clipboard', type: 'ok', icon: 'copy' })); }
    if (kind === 'pin') togglePin(msg);
    if (kind === 'report') Mod.reportMessage(msg, roomId);
    if (kind === 'del') {
      UI.confirm({
        title: 'Delete message?',
        body: 'It will be replaced with a removal notice.',
        okLabel: 'Delete', danger: true
      }).then(ok => {
        if (!ok) return;
        Store.updateMessage(roomId, mid, { deleted: true });
        if (msg.pinned) { msg.pinned = false; Store.save(); renderPinnedBar(); }
      });
    }
    if (kind === 'edit') startEdit(mid);
  }

  function openQuickReactions(rect, mid) {
    UI.closeMenu();
    const bar = U.el('div', { class: 'pop-menu', style: 'flex-direction:row;padding:.35rem;gap:.15rem;' });
    [...QUICK_REACTIONS, '+'].forEach(em => {
      const b = U.el('button', { style: 'width:36px;height:36px;justify-content:center;font-size:1.15rem;' }, em === '+' ? U.icon('plus', 15) : em);
      b.addEventListener('click', () => {
        UI.closeMenu();
        if (em === '+') {
          setTimeout(() => {
            const anchor = U.el('span');
            document.body.appendChild(anchor);
            anchor.style.position = 'fixed'; anchor.style.left = rect.left + 'px'; anchor.style.top = rect.bottom + 'px';
            UI.emojiPicker(anchor, chosen => {
              const added = Store.toggleReaction(roomId, mid, chosen, 'me');
              if (added) { me().stats.reactionsGiven++; Store.addXP(2, 'Reaction'); Store.questProgress('react'); }
              anchor.remove();
            });
          }, 30);
          return;
        }
        const added = Store.toggleReaction(roomId, mid, em, 'me');
        if (added) { me().stats.reactionsGiven++; Store.addXP(2, 'Reaction'); Store.questProgress('react'); }
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    const x = U.clamp(rect.left - bar.offsetWidth / 2, 10, innerWidth - bar.offsetWidth - 10);
    let y = rect.top - bar.offsetHeight - 8; if (y < 8) y = rect.bottom + 8;
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
    activeBar(bar);

    function activeBar(el) {
      const onDoc = ev => { if (!el.contains(ev.target)) cleanup(); };
      const onEsc = ev => { if (ev.key === 'Escape') cleanup(); };
      function cleanup() { el.remove(); document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onEsc); }
      setTimeout(() => {
        document.addEventListener('click', onDoc);
        document.addEventListener('keydown', onEsc);
      });
    }
  }

  function startEdit(mid) {
    const msg = Store.roomMessages(roomId).find(x => x.id === mid);
    const node = U.$(`#msgList [data-mid="${mid}"]`);
    const textEl = node.querySelector('[data-text]');
    if (!msg || !textEl) return;
    editingId = mid;
    textEl.innerHTML = `
      <textarea class="input" style="min-height:60px;width:100%;">${U.esc(msg.text)}</textarea>
      <div class="row" style="margin-top:.45rem;">
        <button class="btn btn-primary btn-sm" data-save>Edit save</button>
        <button class="btn btn-glass btn-sm" data-cancel>Cancel</button>
        <span class="small faint">Enter to save · Esc to cancel</span>
      </div>`;
    const ta = textEl.querySelector('textarea');
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const finish = save => {
      editingId = null;
      if (save && ta.value.trim()) Store.updateMessage(roomId, mid, { text: ta.value.trim(), edited: true });
      else refreshOne(mid);
    };
    textEl.querySelector('[data-save]').addEventListener('click', () => finish(true));
    textEl.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
  }

  function togglePin(msg) {
    msg.pinned = !msg.pinned;
    Store.save();
    Store.emit('msg:update', msg);
    Store.composeMessage(roomId, 'sys', msg.pinned
      ? `📌 **${me().displayName}** pinned a message`
      : `Unpinned a message`, { type: 'system' });
    renderPinnedBar();
    if (msg.pinned) UI.toast({ title: 'Pinned to the top', type: 'ok', icon: 'pin' });
  }

  function renderPinnedBar() {
    const bar = U.$('#pinBar'); if (!bar) return;
    const pins = Store.roomMessages(roomId).filter(m => m.pinned && !m.deleted);
    bar.classList.toggle('hide', !pins.length);
    bar.innerHTML = pins.map(p => `
      <button class="pin-chip" data-pinjump="${p.id}">
        ${U.icon('pin', 13)} <span>${U.esc(p.text.slice(0, 64))}</span>
      </button>`).join('');
    bar.onclick = e => {
      const c = e.target.closest('[data-pinjump]');
      if (c) jumpTo(c.dataset.pinjump);
    };
    drawRightPanel(U.$('.rr-tab.on')?.dataset.tab || 'about');
  }

  function jumpTo(mid) {
    const node = U.$(`#msgList [data-mid="${mid}"]`);
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.remove('flash-target'); void node.offsetWidth;
    node.classList.add('flash-target');
  }

  /* --------------------------- typing indicator --------------------------- */
  function onTyping({ roomId: rid, userId }) {
    if (rid !== roomId || userId === 'me') return;
    clearTimeout(typingSet.get(userId));
    typingSet.set(userId, setTimeout(() => onTypingStop({ userId, roomId: rid }), 7000));
    updateTypingRow();
  }
  function onTypingStop({ roomId: rid, userId }) {
    if (rid !== roomId) return;
    clearTimeout(typingSet.get(userId));
    typingSet.delete(userId);
    updateTypingRow();
  }
  function updateTypingRow() {
    const row = U.$('#typingRow'); if (!row) return;
    const users = [...typingSet.keys()].map(Store.getUser).filter(Boolean);
    if (!users.length) { row.innerHTML = ''; return; }
    const names = users.map(u => u.displayName);
    const label = names.length === 1 ? `<b>${U.esc(names[0])}</b> is typing`
      : names.length === 2 ? `<b>${U.esc(names[0])}</b> and <b>${U.esc(names[1])}</b> are typing`
      : 'Several people are typing';
    row.innerHTML = `<span class="t-avatars">${users.map(u => U.avatar(u, { size: 20 })).join('')}</span>
      <span>${label}</span><span style="display:inline-flex;gap:3px;color:var(--ac2);"><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></span>`;
  }

  /* ------------------------------ right panel ------------------------------ */
  function switchTab(tab) {
    U.$$('.rr-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    drawRightPanel(tab);
    if (innerWidth <= 1024) U.$('#roomView')?.classList.add('right-open');
  }

  function updateOnlineSub() {
    const el = U.$('[data-online-sub]'); if (!el) return;
    const r = room();
    const online = r.members.filter(id => id !== 'me' && Store.getUser(id)?.status === 'online').length + 1;
    el.textContent = `${online} online here`;
  }

  function onRoomUpdate(updated) { if (updated.id === roomId) updateHeadMeta(); }
  function updateHeadMeta() {
    updateOnlineSub();
    const el = U.$('[data-online-sub]'); void el;
    const memEl = U.$('[data-jump-members]');
    if (memEl) memEl.textContent = `${U.fmtCount(room().memberCount)} members`;
  }

  function drawRightPanel(tab) {
    const body = U.$('#rrBody'); if (!body || !roomId) return;
    const r = room();
    if (tab === 'about') {
      const owner = Store.getUser(r.ownerId);
      body.innerHTML = `
        <div class="row" style="gap:.65rem;">
          <div class="rh-icon" style="--rc-bg:${Rooms.catOf(r.category).grad};width:40px;height:40px;font-size:1.25rem;">${r.icon}</div>
          <div><div style="font-family:var(--font-d);font-weight:700;">${U.esc(r.name)}</div>
          <div class="small faint">${Rooms.catOf(r.category).label} · created ${U.fmtRel(r.createdAt)}</div></div>
        </div>
        <p class="about-blurb" style="margin-top:.9rem;">${U.esc(r.desc)}</p>
        <div class="rc-tags" style="margin-top:.7rem;">${(r.tags || []).map(t => `<span class="chip">#${U.esc(t)}</span>`).join('')}</div>
        <div class="rr-section-title">Owner</div>
        ${owner ? memberRowHTML(owner, 'owner') : ''}
        <div class="rr-section-title">House rules</div>
        <ul class="rules-box">${(r.rules || []).map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
        <div class="rr-section-title">Momentum</div>
        <div class="card" style="padding:.8rem .9rem;">
          <div class="spread"><span class="small muted">Room energy</span><b>${r.momentum}/100</b></div>
          <div class="bar-track" style="margin-top:.5rem;"><div class="bar-fill" style="width:${r.momentum}%"></div></div>
          <div class="small faint" style="margin-top:.45rem;">Rises as the room chats. High momentum = trending 🔥</div>
        </div>`;
    }
    if (tab === 'members') {
      const roleOrder = uid => uid === r.ownerId ? 0 : (r.mods || []).includes(uid) ? 1 : 2;
      const members = r.members.map(Store.getUser).filter(Boolean).sort((a, b) => roleOrder(a.id) - roleOrder(b.id));
      body.innerHTML = `
        <input class="input" placeholder="Find a member…" style="margin-bottom:.7rem;" id="memberFilter">
        <div id="memberRows">${members.map(u => memberRowHTML(u,
          u.id === r.ownerId ? 'owner' : (r.mods || []).includes(u.id) ? 'mod' : '')).join('')}</div>`;
      body.querySelector('#memberFilter').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        body.querySelectorAll('#memberRows .member-row').forEach(row => {
          row.style.display = row.dataset.n.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }
    if (tab === 'pins') {
      const pins = Store.roomMessages(roomId).filter(m => m.pinned && !m.deleted);
      body.innerHTML = pins.length ? pins.map(p => `
        <button class="pin-chip" style="white-space:normal;display:flex;" data-pinjump="${p.id}">
          ${U.icon('pin', 14)} <span style="white-space:normal;">${U.esc(p.text.slice(0, 120))}</span>
        </button>`).join('')
        : `<div class="empty" style="padding:2rem 0;"><p>No pins yet. Hover a message and hit the 📌.</p></div>`;
      body.querySelectorAll('[data-pinjump]').forEach(b => b.addEventListener('click', () => jumpTo(b.dataset.pinjump)));
    }
    if (tab === 'tools') {
      body.innerHTML = `
        <div class="rr-section-title" style="margin-top:0;">Zephyr quick actions</div>
        ${[['Summarize recent chat', 'summarize this room', 'list'],
           ['Explain latest messages', 'explain the latest messages', 'info'],
           ['Suggest conversation topics', 'suggest topics', 'bulb'],
           ['Draft a better room description', 'generate a room description', 'wand'],
           ['Moderation coaching', 'moderation tips', 'shield']].map(([label, q, ic]) => `
          <button class="member-row" data-zq="${U.esc(q)}">${U.icon(ic, 17)}<span class="mr-info mr-n">${label}</span></button>`).join('')}
        <div class="rr-section-title">Mini activities</div>
        <div class="row" style="gap:.5rem;">
          <button class="btn btn-glass btn-sm grow" id="tRace">${U.icon('zap', 15)} Reaction Race</button>
          <button class="btn btn-glass btn-sm grow" id="tTrivia">${U.icon('bulb', 15)} Trivia Rush</button>
        </div>
        <div class="rr-section-title">Create</div>
        <button class="btn btn-glass btn-sm btn-block" id="tPoll">${U.icon('chart', 15)} Instant poll</button>
        <div class="rr-section-title">Room stats</div>
        <div class="pc-stats">
          ${[['Messages', Store.roomMessages(roomId).length],
             ['Members', U.fmtCount(r.memberCount)],
             ['Pins', Store.roomMessages(roomId).filter(m => m.pinned).length],
             ['Momentum', r.momentum]].map(([k, v]) => `<div class="pc-stat"><b>${v}</b><span>${k}</span></div>`).join('')}
        </div>`;
      body.querySelectorAll('[data-zq]').forEach(b => b.addEventListener('click', () => AI.openDrawer(roomId, b.dataset.zq)));
      body.querySelector('#tRace').addEventListener('click', () => Activities.launch('race', roomId));
      body.querySelector('#tTrivia').addEventListener('click', () => Activities.launch('trivia', roomId));
      body.querySelector('#tPoll').addEventListener('click', () => pollBuilder());
    }
  }

  function memberRowHTML(u, role) {
    return `<button class="member-row" data-user-card="${u.id}" data-n="${U.esc((u.displayName + ' ' + u.username).toLowerCase())}">
      ${U.avatar(u, { size: 34, presence: true })}
      <span class="mr-info">
        <span class="mr-n">${U.esc(u.displayName)} ${u.id === 'me' ? '<span class="role-tag you">you</span>' : ''}
        ${role === 'owner' ? '<span class="role-tag owner">owner</span>' : role === 'mod' ? '<span class="role-tag mod">mod</span>' : ''}</span>
        <span class="mr-s">${u.status === 'online' ? '🟢 online' : u.status === 'away' ? '🟡 away' : '· ' + (u.statusMsg || 'offline')}</span>
      </span>
    </button>`;
  }

  /* ---------------------------- in-room search ---------------------------- */
  function toggleRoomSearch() {
    U.$('.room-search-drop')?.remove();
    const drop = U.el('div', { class: 'room-search-drop' });
    drop.innerHTML = `
      <div style="padding:.6rem;border-bottom:1px solid var(--brd-1);">
        <input class="input" id="rsQuery" placeholder="Search this room…">
      </div>
      <div class="rs-results" id="rsResults"><div class="empty" style="padding:1rem;"><p>Type to search messages</p></div></div>`;
    U.$('.room-main').appendChild(drop);
    const input = drop.querySelector('#rsQuery');
    input.focus();
    input.addEventListener('input', U.debounce(() => {
      const q = input.value.toLowerCase();
      const res = drop.querySelector('#rsResults');
      if (q.length < 2) { res.innerHTML = '<div class="empty" style="padding:1rem;"><p>Type to search messages</p></div>'; return; }
      const hits = Store.roomMessages(roomId).filter(m => !m.deleted && m.text.toLowerCase().includes(q)).slice(-12).reverse();
      res.innerHTML = hits.length ? hits.map(h => {
        const u = authorOf(h);
        return `<button class="rs-item" data-pinjump="${h.id}">
          <div class="rs-m">${U.avatar(u || { username: '?' }, { size: 18 })} <b>${U.esc(u?.displayName || '?')}</b> · ${U.fmtRel(h.ts)}</div>
          <div class="rs-t">${U.esc(h.text.slice(0, 90))}</div>
        </button>`;
      }).join('') : '<div class="empty" style="padding:1rem;"><p>No matches found</p></div>';
    }, 140));
    drop.addEventListener('click', e => {
      const item = e.target.closest('[data-pinjump]');
      if (item) { drop.remove(); jumpTo(item.dataset.pinjump); }
    });
    setTimeout(() => {
      const closer = ev => { if (!drop.contains(ev.target)) { drop.remove(); document.removeEventListener('click', closer); } };
      document.addEventListener('click', closer);
    });
  }

  /* ------------------------------- polls ---------------------------------- */
  function pollBuilder() {
    const opts = [''];
    const m = UI.openModal({
      title: `${U.icon('chart', 18)} Create an instant poll`,
      body: `
        <div class="field"><label>Question</label>
          <input class="input" id="pbQ" maxlength="120" placeholder="What should we decide?"></div>
        <div class="field"><label>Options</label><div id="pbOpts"></div>
          <button class="chip" id="pbAdd">＋ Add option</button></div>`,
      footer: `<button class="btn btn-primary" id="pbGo">Post poll</button>`
    });
    function drawOpts() {
      m.card.querySelector('#pbOpts').innerHTML = opts.map((v, i) =>
        `<div class="row" style="margin-bottom:.5rem;">
          <input class="input pb-opt-input" data-i="${i}" value="${U.esc(v)}" maxlength="60" placeholder="Option ${i + 1}">
          ${opts.length > 2 ? `<button class="icon-btn sm" data-rm="${i}">${U.icon('x', 13)}</button>` : ''}
        </div>`).join('');
      m.card.querySelectorAll('.pb-opt-input').forEach(inp => inp.addEventListener('input', () => opts[+inp.dataset.i] = inp.value));
      m.card.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { opts.splice(+b.dataset.rm, 1); drawOpts(); }));
    }
    drawOpts();
    m.card.querySelector('#pbAdd').addEventListener('click', () => { if (opts.length < 6) { opts.push(''); drawOpts(); } });
    m.card.querySelector('#pbGo').addEventListener('click', () => {
      const q = m.card.querySelector('#pbQ').value.trim();
      const labels = opts.map(o => o.trim()).filter(Boolean);
      if (!q || labels.length < 2) { UI.toast({ title: 'Poll needs a question + 2 options', type: 'warn' }); return; }
      Store.composeMessage(roomId, 'me', q, {
        type: 'poll',
        poll: { question: q, options: labels.map(l => ({ label: l, votes: [] })) }
      });
      Store.addXP(8, 'Created a poll');
      m.close();
      UI.toast({ title: 'Poll posted 📊', body: 'Votes roll in live.', type: 'xp', icon: 'chart' });
    });
  }

  function showRules() {
    const r = room();
    UI.openModal({
      slim: true,
      title: `${U.icon('shield', 17)} Rules — ${U.esc(r.name)}`,
      body: `<ul class="rules-box">${(r.rules || []).map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>`,
      footer: `<button class="btn btn-glass" data-close2>Got it</button>`
    }).card.querySelector('[data-close2]').addEventListener('click', () => UI.closeModal());
  }

  return { mount, unmount, rerender, get currentRoomId() { return roomId; } };
})();
