/* ==========================================================================
   Drift · settings.js — profile, appearance, notifications, privacy,
   chat, accessibility, AI, account and moderation panels.
   ========================================================================== */

window.SettingsPage = (() => {
  'use strict';

  const SECTIONS = [
    ['profile',    'Profile',        'user'],
    ['appearance', 'Appearance',     'palette'],
    ['notifications', 'Notifications', 'bell'],
    ['privacy',    'Privacy',        'lock'],
    ['chat',       'Chat',           'message'],
    ['ai',         'AI (Zephyr)',    'sparkles'],
    ['moderation', 'Moderation',     'shield'],
    ['account',    'Account',        'gear']
  ];

  let section = 'profile';

  function render(root, initial) {
    if (initial) section = initial;
    root.innerHTML = `
      <div class="view-inner">
        <div class="view-head"><h1>Settings</h1><p class="sub">Make Drift feel like yours.</p></div>
        <div class="settings-layout">
          <nav class="set-nav" id="setNav">
            ${SECTIONS.map(([k, label, ic]) => `
              <button data-s="${k}" class="${k === section ? 'on' : ''}">${U.icon(ic, 17)} ${label}</button>`).join('')}
          </nav>
          <div class="set-panel" id="setPanel"></div>
        </div>
      </div>`;
    U.$('#setNav').addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      section = b.dataset.s;
      U.$$('#setNav button').forEach(x => x.classList.toggle('on', x.dataset.s === section));
      draw();
    });
    draw();
  }

  const S = () => Store.state.settings;

  /* Shared row builder */
  const row = (title, desc, controlHTML) => `
    <div class="card set-row"><div class="s-main"><b>${title}</b><p>${desc}</p></div>${controlHTML}</div>`;
  const toggle = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="knob-track"></span></label>`;

  function draw() {
    const panel = U.$('#setPanel'); if (!panel) return;
    const s = S();

    if (section === 'profile') {
      const u = Store.me();
      panel.innerHTML = `
        <h2>Your profile</h2>
        <p class="desc">This is what other drifters see when they tap your name.</p>

        <div class="card" style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;margin-bottom:1.2rem;">
          <span class="level-ring" style="--lvl-pct:${Store.lvlInfo(u.xp).pct};border-radius:50%;">${U.avatar(u, { size: 74, presence: true })}</span>
          <div class="grow">
            <b style="font-family:var(--font-d);font-size:1.1rem;" class="${U.nameClasses(u)}">${U.esc(u.displayName)}</b>
            <div class="small faint">@${U.esc(u.username)} · Level ${Store.lvlInfo(u.xp).level}</div>
            <button class="chip" style="margin-top:.5rem;" id="prEmoji">Avatar emoji: ${u.avatarEmoji || 'none'} ✏️</button>
          </div>
        </div>

        <div class="field"><label>Display name</label><input class="input" id="prName" value="${U.esc(u.displayName)}" maxlength="30"></div>
        <div class="field"><label>Bio</label><textarea class="input" id="prBio" rows="2" maxlength="140">${U.esc(u.bio || '')}</textarea></div>
        <div class="field"><label>Status message</label><input class="input" id="prStatus" value="${U.esc(u.statusMsg || '')}" maxlength="80" placeholder="What's happening?"></div>
        <div class="field"><label>Availability</label>
          <div class="seg" id="prAvail">
            ${[['online', '🟢 Online'], ['away', '🟡 Away'], ['offline', '⚫ Appear offline']].map(([v, l]) =>
              `<button data-v="${v}" class="${u.status === v ? 'on' : ''}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="field"><label>Banner color</label>
          <div class="swatches" id="prBannerSwatches">
            ${['', '#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#ec4899', '#8b5cf6'].map(c => {
              const active = (u.bannerColor || '') === c;
              return `<button class="swatch ${active ? 'on' : ''}" data-bc="${c}" style="${c ? `--sw-c:${c};background:${c};` : 'background:linear-gradient(135deg,hsl(260,72%,55%),hsl(308,78%,44%));'}" title="${c || 'Default'}"></button>`;
            }).join('')}
          </div>
          <div class="input-hint">Your profile cover and avatar background gradient.</div>
        </div>
        <div class="field"><label>Name style</label>
          <div class="chip-row" id="prFontRow" style="flex-wrap:wrap;">
            ${[['', 'Default'], ['serif', 'Serif'], ['mono', 'Mono'], ['cursive', 'Cursive'], ['rainbow', 'Rainbow']].map(([k, l]) =>
              `<button class="chip ${(u.nameFont || '') === k ? 'on' : ''}" data-nf="${k}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="field"><label>Name glow</label>
          <div class="chip-row" id="prGlowRow" style="flex-wrap:wrap;">
            ${[['', 'None'], ['soft', 'Soft'], ['neon', 'Neon'], ['fire', 'Fire'], ['ice', 'Ice']].map(([k, l]) =>
              `<button class="chip ${(u.nameGlow || '') === k ? 'on' : ''}" data-ng="${k}">${l}</button>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary" id="prSave">Save profile</button>`;

      panel.querySelector('#prEmoji').addEventListener('click', e => {
        UI.emojiPicker(e.currentTarget, async em => {
          const me = Store.me();
          me.avatarEmoji = em;
          me.avatarUrl = '';
          Store.touchProfile();
          try { await SB.client.from('profiles').update({ avatar_emoji: em, avatar_url: null }).eq('id', me.id); } catch (err) {}
          draw();
          window.AppShell?.refreshIdentity?.();
          UI.toast({ title: `Avatar emoji set to ${em}`, type: 'ok', icon: 'check' });
        });
      });
      panel.querySelectorAll('#prAvail button').forEach(b => b.addEventListener('click', () => {
        const v = b.dataset.v;
        if (window.Backend?.updateStatus) Backend.updateStatus(v);
        else { Store.me().status = v; Store.touchProfile(); Store.emit('presence', Store.state.meta.onlineCount); window.AppShell?.refreshIdentity?.(); }
        panel.querySelectorAll('#prAvail button').forEach(x => x.classList.toggle('on', x === b));
        UI.toast({ title: v === 'online' ? 'You’re online 🟢' : v === 'away' ? 'You’re away 🟡' : 'Appearing offline ⚫', body: v === 'offline' ? 'Others will see you as offline.' : '', type: 'ok', icon: v === 'online' ? 'check' : 'moon', duration: 2500 });
      }));
      panel.querySelector('#prSave').addEventListener('click', () => {
        const u = Store.me();
        u.displayName = panel.querySelector('#prName').value.trim() || u.username;
        u.bio = panel.querySelector('#prBio').value.trim();
        u.statusMsg = panel.querySelector('#prStatus').value.trim();

        Store.touchProfile();
        UI.toast({ title: 'Profile saved ✨', type: 'ok', icon: 'check' });
        window.AppShell?.refreshIdentity();
      });
      panel.querySelectorAll('#prBannerSwatches .swatch').forEach(b => b.addEventListener('click', () => {
        const me = Store.me();
        me.bannerColor = b.dataset.bc;
        panel.querySelectorAll('#prBannerSwatches .swatch').forEach(x => x.classList.toggle('on', x === b));
        Store.touchProfile();
        window.AppShell?.refreshIdentity?.();
      }));
      panel.querySelectorAll('#prFontRow .chip').forEach(b => b.addEventListener('click', () => {
        const me = Store.me();
        me.nameFont = b.dataset.nf;
        panel.querySelectorAll('#prFontRow .chip').forEach(x => x.classList.toggle('on', x === b));
        Store.touchProfile();
      }));
      panel.querySelectorAll('#prGlowRow .chip').forEach(b => b.addEventListener('click', () => {
        const me = Store.me();
        me.nameGlow = b.dataset.ng;
        panel.querySelectorAll('#prGlowRow .chip').forEach(x => x.classList.toggle('on', x === b));
        Store.touchProfile();
      }));
    }

    if (section === 'appearance') {
      panel.innerHTML = `
        <h2>Appearance</h2>
        <p class="desc">Themes, accents and density.</p>
        <div class="row" style="margin-bottom:.9rem;">
          ${[['dark', 'moon', '#0b0e19'], ['light', 'sun', '#eef1f9']].map(([v, ic]) => `
            <button class="theme-opt ${s.theme === v ? 'on' : ''}" data-theme-opt="${v}">
              <div class="to-prev" style="background:${{dark:'#0b0e19',light:'#f4f6ff'}[v]};"></div>
              ${U.icon(ic, 15)} <span>${v[0].toUpperCase() + v.slice(1)}</span>
            </button>`).join('')}
        </div>
        <div class="card set-row"><div class="s-main"><b>Accent color</b><p>Used across gradients & highlights.</p></div>
          <div class="swatches">
            ${[['violet', '#7c5cff'], ['cyan', '#0ea5e9'], ['emerald', '#10b981'], ['amber', '#f59e0b'], ['rose', '#f43f5e']].map(([k, c]) =>
              `<button class="swatch ${s.accent === k && !s.customAccent ? 'on' : ''}" data-accent-set="${k}" style="--sw-c:${c};background:${c};" aria-label="${k}"></button>`).join('')}
            <label class="swatch custom ${s.customAccent ? 'on' : ''}" title="Custom color" style="--sw-c:${s.customAccent || 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)'};background:${s.customAccent || ''};">
              <input type="color" id="accentPick" value="${s.customAccent || '#7c5cff'}" aria-label="Pick a custom accent color">
            </label>
          </div>
        </div>
        <div class="card set-row"><div class="s-main"><b>Ambient background</b><p>The soft aurora glow behind the app.</p></div>
          <div class="seg" id="setAmbience">
            ${[['off', 'Off'], ['soft', 'Soft'], ['full', 'Full']].map(([v, l]) =>
              `<button data-v="${v}" class="${(s.ambience || 'full') === v ? 'on' : ''}">${l}</button>`).join('')}
          </div>
        </div>
        ${row('Font size', 'Comfortable reading at any distance.', `<div class="seg" id="setFont">
            ${['s', 'm', 'l'].map(f => `<button data-f="${f}" class="${s.font === f ? 'on' : ''}">${{ s: 'Small', m: 'Default', l: 'Large' }[f]}</button>`).join('')}</div>`)}
        ${row('Compact mode', 'Tighter spacing for power users.', toggle('setCompact', s.compactMode))}
        ${row('Reduced motion', 'Calms animations across the app.', toggle('setMotion', s.motion === 'reduced'))}
        ${row('High contrast', 'Stronger borders and text contrast.', toggle('setContrast', s.contrast === 'high'))}`;

      panel.querySelectorAll('[data-theme-opt]').forEach(b => b.addEventListener('click', () => {
        S().theme = b.dataset.themeOpt; applyAndSave(); draw();
      }));
      panel.querySelectorAll('[data-accent-set]').forEach(b => b.addEventListener('click', () => {
        S().accent = b.dataset.accentSet; S().customAccent = ''; applyAndSave(); draw();
      }));
      panel.querySelector('#accentPick').addEventListener('input', e => {
        S().customAccent = e.target.value; applyAndSave(); draw();
      });
      panel.querySelector('#setAmbience').addEventListener('click', e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        S().ambience = b.dataset.v; applyAndSave(); draw();
      });
      panel.querySelector('#setFont').addEventListener('click', e => {
        const b = e.target.closest('[data-f]'); if (!b) return;
        S().font = b.dataset.f; applyAndSave(); draw();
      });
      panel.querySelector('#setCompact').addEventListener('change', e => { S().compactMode = e.target.checked; applyAndSave(); });
      panel.querySelector('#setMotion').addEventListener('change', e => { S().motion = e.target.checked ? 'reduced' : 'full'; applyAndSave(); });
      panel.querySelector('#setContrast').addEventListener('change', e => { S().contrast = e.target.checked ? 'high' : 'normal'; applyAndSave(); });
    }

    if (section === 'notifications') {
      const n = s.notifs;
      panel.innerHTML = `
        <h2>Notifications</h2>
        <p class="desc">Choose what reaches you. Mentions always break through in rooms you're active in.</p>
        <div class="set-group">
          ${row('@ Mentions', 'Someone tags you in a message.', toggle('nMention', n.mention))}
          ${row('Friend requests', 'Requests & acceptances.', toggle('nFriend', n.friend))}
          ${row('Room invites', 'Invites to private rooms.', toggle('nInvite', n.invite))}
          ${row('Room activity', 'Trending rooms & new members.', toggle('nActivity', n.room_activity))}
          ${row('Achievements', 'Badges, streaks & quests.', toggle('nAchievement', n.achievement))}
          ${row('New messages', 'All messages in joined rooms (noisy!).', toggle('nMessage', n.message))}
          ${row('Zephyr replies', 'AI responses when you\u2019re away.', toggle('nAI', n.ai))}
          ${row('System notices', 'Product updates & security.', toggle('nSystem', n.system))}
          ${row('Sound effects', 'Subtle blips for toasts.', toggle('nSounds', s.sounds))}
          ${row('Desktop notifications', 'Get browser notifications when messages arrive.', toggle('nDesktop', s.desktopNotifs))}
        </div>`;
      [['nMention', 'mention'], ['nFriend', 'friend'], ['nInvite', 'invite'], ['nActivity', 'room_activity'],
       ['nAchievement', 'achievement'], ['nMessage', 'message'], ['nAI', 'ai'], ['nSystem', 'system']].forEach(([id, key]) => {
        panel.querySelector('#' + id).addEventListener('change', e => { s.notifs[key] = e.target.checked; Store.save(); });
      });
      panel.querySelector('#nSounds').addEventListener('change', e => { s.sounds = e.target.checked; Store.save(); });
      panel.querySelector('#nDesktop').addEventListener('change', async e => {
        s.desktopNotifs = e.target.checked;
        if (e.target.checked && 'Notification' in window) {
          if (Notification.permission === 'default') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') { s.desktopNotifs = false; e.target.checked = false; }
          } else if (Notification.permission === 'denied') {
            s.desktopNotifs = false; e.target.checked = false;
            UI.toast({ title: 'Notifications blocked', body: 'Enable them in your browser settings.', type: 'warn' });
          }
        }
        Store.save();
      });
    }

    if (section === 'privacy') {
      panel.innerHTML = `
        <h2>Privacy</h2>
        <p class="desc">You control your footprint.</p>
        <div class="set-group">
          ${row('Show last seen', 'Let others see when you were last online.', toggle('pvLastSeen', s.privacyLastSeen))}
          ${row('Read receipts', 'Show others when you\'ve seen their messages.', toggle('pvRead', s.readReceipts))}
        </div>
        <div class="section-label">${U.icon('ban', 16)} Blocked users (${Store.state.meta.blockedUsers.length})</div>
        <div class="page-grid">
          ${Store.state.meta.blockedUsers.length
            ? Store.state.meta.blockedUsers.map(id => {
                const u = Store.getUser(id); return u ? row(`@${U.esc(u.username)}`, U.esc(u.displayName), `<button class="btn btn-glass btn-sm" data-unblock="${id}">Unblock</button>`) : '';
              }).join('')
            : '<div class="card set-row"><p class="muted small">No one is blocked. May it stay that way 🕊️</p></div>'}
        </div>`;
      panel.querySelector('#pvLastSeen').addEventListener('change', e => { s.privacyLastSeen = e.target.checked; Store.save(); });
      panel.querySelector('#pvRead').addEventListener('change', e => { s.readReceipts = e.target.checked; Store.save(); Chat.rerender(); });
      panel.querySelectorAll('[data-unblock]').forEach(b => b.addEventListener('click', () => { Mod.toggleBlock(b.dataset.unblock); draw(); }));
    }

    if (section === 'chat') {
      panel.innerHTML = `
        <h2>Chat</h2>
        <p class="desc">Composer and message behavior.</p>
        <div class="set-group">
          ${row('Enter to send', 'Off = Enter adds a newline, Ctrl+Enter sends.', toggle('chEnter', s.enterToSend))}
          ${row('Link previews', 'Generate preview cards for links.', toggle('chLinks', s.linkPreviews))}
          ${row('24-hour timestamps', '14:30 instead of 2:30 PM.', toggle('ch24h', s.showTimestamps24h))}
        </div>
        <div class="card set-row"><div class="s-main"><b>Keyboard shortcuts</b><p>Power through Drift.</p></div></div>
        <div class="page-grid">
          ${[['⌘/Ctrl + K', 'Global search palette'], ['/', 'Quick search'], ['Esc', 'Close overlays'], ['Shift + Enter', 'New line']].map(([k, d]) =>
            row(`<kbd class="kbd">${k}</kbd>`, d, '')).join('')}
        </div>`;
      panel.querySelector('#chEnter').addEventListener('change', e => { s.enterToSend = e.target.checked; Store.save(); });
      panel.querySelector('#chLinks').addEventListener('change', e => { s.linkPreviews = e.target.checked; Store.save(); Chat.rerender(); });
      panel.querySelector('#ch24h').addEventListener('change', e => { s.showTimestamps24h = e.target.checked; Store.save(); });
    }

    if (section === 'ai') {
      const live = AI.remoteConfigured?.();
      panel.innerHTML = `
        <h2>Zephyr AI</h2>
        <p class="desc">Drift's built-in companion — works with ANY OpenAI-compatible API.</p>
        <div class="card card-glow lit" style="margin-bottom:1rem;">
          <div class="row" style="gap:.7rem;">
            <div class="ai-av">✨</div>
            <div class="grow"><b>Zephyr status</b>
              <p class="small muted">${live
                ? `<b style="color:var(--ok)">Live.</b> Model <span class="mono">${U.esc(window.DriftConfig.AI_MODEL)}</span> via ${window.DriftConfig.AI_PROXY_URL ? 'your secure proxy' : U.esc(new URL(window.DriftConfig.AI_BASE_URL).host)}${window.DriftConfig.AI_API_KEY && !window.DriftConfig.AI_PROXY_URL ? ' — ⚠️ key is public in front-end code; rotate it if abused' : ''}.`
                : '<b style="color:var(--warn)">Offline rule engine.</b> Add an API key below for real intelligence.'}</p>
            </div>
          </div>
        </div>
        
        <div class="section-label">${U.icon('key', 16)} API Configuration</div>
        <div class="field"><label>API Base URL</label>
          <input class="input" id="aiBaseUrl" placeholder="https://api.aimlapi.com/v1" value="${U.esc(window.DriftConfig.AI_BASE_URL)}">
          <div class="input-hint">OpenAI-compatible base URL. Examples: <span class="mono">https://api.openai.com/v1</span>, <span class="mono">https://api.aimlapi.com/v1</span>, <span class="mono">https://api.together.xyz/v1</span>, <span class="mono">https://api.groq.com/openai/v1</span>, <span class="mono">http://localhost:11434/v1</span> (Ollama)</div>
        </div>
        <div class="field"><label>Model</label>
          <input class="input" id="aiModel" placeholder="gpt-3.5-turbo" value="${U.esc(window.DriftConfig.AI_MODEL)}">
          <div class="input-hint">Model name supported by your provider (e.g. <span class="mono">gpt-4o</span>, <span class="mono">meta-llama/Meta-Llama-3.1-8B-Instruct</span>, <span class="mono">llama3.1</span>)</div>
        </div>
        <div class="field"><label>API Key</label>
          <div class="row" style="gap:.55rem;">
            <input class="input" id="aiKeyInput" type="password" placeholder="sk-..." autocomplete="off" value="${U.esc(AI.storedKey ? AI.storedKey() : '')}">
            <button class="btn btn-glass btn-sm" id="aiKeySave">Save</button>
          </div>
          <div class="input-hint">Stored only in this browser — never uploaded. Get keys at <span class="mono">aimlapi.com</span>, <span class="mono">openai.com</span>, <span class="mono">groq.com</span>, etc.</div>
        </div>
        <div class="field"><label>Request Format</label>
          <div class="seg" id="aiFormat">
            ${['openai', 'azure', 'custom'].map(f => `<button data-f="${f}" class="${(window.DriftConfig.AI_REQUEST_FORMAT || 'openai') === f ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
          </div>
          <div class="input-hint">OpenAI = standard /chat/completions. Azure = Azure OpenAI deployment format. Custom = use base URL as-is.</div>
        </div>
        <div class="field"><label>Temperature</label>
          <input class="input" type="number" step="0.1" min="0" max="2" id="aiTemp" value="${window.DriftConfig.AI_TEMPERATURE}">
          <div class="input-hint">Higher = more creative, lower = more focused. Default: 0.7</div>
        </div>
        <div class="field"><label>Max Tokens</label>
          <input class="input" type="number" step="50" min="100" max="4000" id="aiMaxTokens" value="${window.DriftConfig.AI_MAX_TOKENS}">
          <div class="input-hint">Maximum response length. Default: 600</div>
        </div>
        <div class="field"><label>Custom Headers (JSON)</label>
          <textarea class="input" id="aiCustomHeaders" rows="3" placeholder='{"Authorization": "Bearer your-key"}' style="font-family:var(--mono);font-size:.75rem;">${U.esc(JSON.stringify(window.DriftConfig.AI_CUSTOM_HEADERS || {}, null, 2))}</textarea>
          <div class="input-hint">Extra headers for custom APIs. Leave empty unless your provider requires them.</div>
        </div>
        <div class="field"><label>Keyless Mode</label>
          ${toggle('aiKeyless', window.DriftConfig.AI_KEYLESS)}
          <div class="input-hint">Enable for keyless providers like Pollinations. Disable for APIs requiring auth.</div>
        </div>
        
        <div class="section-label">${U.icon('user', 16)} Personality</div>
        <div class="field"><label>Persona</label>
          <div class="seg" id="aiPersona">
            ${['friendly', 'concise', 'playful'].map(p => `<button data-p="${p}" class="${s.aiPersona === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
          </div>
          <div class="input-hint">Friendly warms things up · Concise trims the fluff · Playful adds sparkle.</div>
        </div>
        ${row('Share room context', 'Zephyr can read recent messages to summarize & explain.', toggle('aiCtx', s.aiContext))}
        
        <div class="card set-row" style="border-style:dashed;">
          <div class="s-main"><b>Going to production? 🔐</b>
            <p>Move the key into a Supabase Edge Function and point <span class="mono">AI_PROXY_URL</span> at it — never ship API keys in front-end code.</p></div>
        </div>`;
      panel.querySelector('#aiPersona').addEventListener('click', e => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        s.aiPersona = b.dataset.p; Store.save(); draw();
      });
      panel.querySelector('#aiCtx').addEventListener('change', e => { s.aiContext = e.target.checked; Store.save(); });
      panel.querySelector('#aiKeySave').addEventListener('click', e => {
        const inp = panel.querySelector('#aiKeyInput');
        AI.setStoredKey(inp.value.trim());
        UI.toast({
          title: AI.storedKey() ? 'API key saved' : 'API key removed',
          body: AI.storedKey() ? 'Zephyr now answers with the live model.' : 'Zephyr falls back to the offline rule engine.',
          type: 'ok'
        });
        draw();
      });
      // AI config handlers
      panel.querySelector('#aiBaseUrl').addEventListener('change', e => { window.DriftConfig.AI_BASE_URL = e.target.value.trim(); draw(); });
      panel.querySelector('#aiModel').addEventListener('change', e => { window.DriftConfig.AI_MODEL = e.target.value.trim(); draw(); });
      panel.querySelector('#aiFormat').addEventListener('click', e => {
        const b = e.target.closest('[data-f]'); if (!b) return;
        window.DriftConfig.AI_REQUEST_FORMAT = b.dataset.f;
        panel.querySelectorAll('#aiFormat button').forEach(x => x.classList.toggle('on', x === b));
        draw();
      });
      panel.querySelector('#aiTemp').addEventListener('change', e => { window.DriftConfig.AI_TEMPERATURE = parseFloat(e.target.value) || 0.7; draw(); });
      panel.querySelector('#aiMaxTokens').addEventListener('change', e => { window.DriftConfig.AI_MAX_TOKENS = parseInt(e.target.value, 10) || 600; draw(); });
      panel.querySelector('#aiCustomHeaders').addEventListener('change', e => {
        try { window.DriftConfig.AI_CUSTOM_HEADERS = JSON.parse(e.target.value); } catch (err) { UI.toast({ title: 'Invalid JSON', body: err.message, type: 'bad' }); }
      });
      panel.querySelector('#aiKeyless').addEventListener('change', e => { window.DriftConfig.AI_KEYLESS = e.target.checked; draw(); });
    }

    if (section === 'moderation') {
      panel.innerHTML = `
        <h2>Moderation</h2>
        <p class="desc">Reports you filed. Visible to whoever operates this Drift project.</p>
        <div class="set-group" style="margin-bottom:1.1rem;">
          ${row('Safe mode 🛡️', 'Blur out swearing everywhere in chat. Click a blurred word to reveal it.', toggle('setSafe', s.safeMode))}
        </div>
        <div id="modDash">${Mod.dashboardHTML()}</div>`;
      panel.querySelector('#setSafe').addEventListener('change', e => {
        s.safeMode = e.target.checked; Store.save();
        UI.toast({ title: s.safeMode ? 'Safe mode on' : 'Safe mode off', body: s.safeMode ? 'Swearing is now blurred in every room.' : 'Messages show as written.', type: 'ok' });
        if (window.Chat?.rerender) Chat.rerender();
      });
      Mod.bindDashboard(panel);
    }

    if (section === 'account') {
      const u = Store.me();
      panel.innerHTML = `
        <h2>Account</h2>
        <p class="desc">Credentials are handled by Supabase Auth — passwords are never stored in this app.</p>
        <div class="set-group">
          ${row('Username', '@' + U.esc(u.username), '<button class="btn btn-glass btn-sm" id="acUser">Change</button>')}
          ${row('Email', U.esc(u.email), '<button class="btn btn-glass btn-sm" id="acEmail">Change</button>')}
          ${row('Password', '••••••••', '<button class="btn btn-glass btn-sm" id="acPass">Change</button>')}
          ${row('Export my data', 'Download your profile, rooms & messages as JSON.', '<button class="btn btn-glass btn-sm" id="acExport">' + U.icon('download', 14) + ' Export</button>')}
        </div>
        <button class="btn btn-danger btn-block" id="acLogout" style="max-width:320px;">${U.icon('logout', 16)} Log out of Drift</button>`;

      panel.querySelector('#acUser').addEventListener('click', async () => {
        try {
          const v = await UI.prompt({ title: 'Change username', label: 'New username', value: Store.me().username, okLabel: 'Update' });
          if (!v) return;
          const btn = panel.querySelector('#acUser'); btn.disabled = true;
          await Auth.changeUsername(v);
          window.AppShell?.refreshIdentity();
          UI.toast({ title: 'Username updated → @' + Store.me().username, type: 'ok' }); draw();
        } catch (err) { UI.toast({ title: err.message, type: 'bad' }); }
      });
      panel.querySelector('#acEmail').addEventListener('click', async () => {
        const v = await UI.prompt({ title: 'Change email', label: 'New email', value: Store.me().email || '' });
        if (!v) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { UI.toast({ title: 'Invalid email', type: 'bad' }); return; }
        try {
          await Auth.changeEmail(v);
          UI.toast({ title: 'Email update started', body: 'Check the new inbox for a confirmation link.', type: 'ok' }); draw();
        } catch (err) { UI.toast({ title: err.message, type: 'bad' }); }
      });
      panel.querySelector('#acPass').addEventListener('click', async () => {
        const cur = await UI.prompt({ title: 'Current password', label: 'Enter current password' });
        if (!cur) return;
        const next = await UI.prompt({ title: 'New password', label: 'At least 8 characters' });
        if (!next) return;
        try { await Auth.changePassword(cur, next); UI.toast({ title: 'Password updated', type: 'ok', icon: 'check' }); }
        catch (err) { UI.toast({ title: err.message, type: 'bad' }); }
      });
      panel.querySelector('#acExport').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ exportedAt: Date.now(), profile: { ...Store.me(), email: undefined }, rooms: Store.state.rooms.filter(r => r.members.includes('me')), settings: S() }, null, 2)], { type: 'application/json' });
        const a = U.el('a', { href: URL.createObjectURL(blob), download: 'drift-data.json' });
        document.body.appendChild(a); a.click(); a.remove();
        UI.toast({ title: 'Data exported', body: 'drift-data.json downloaded.', type: 'ok', icon: 'download' });
      });
      panel.querySelector('#acLogout').addEventListener('click', async () => {
        if (!(await UI.confirm({ title: 'Log out?', body: 'You can log back in any time with your email and password.', okLabel: 'Log out', danger: true }))) return;
        Auth.signOut();
      });
    }
  }

  /** Push appearance settings onto the <html> element. Called app-wide. */
  function applyTheme() {
    const s = S();
    const r = document.documentElement;
    r.dataset.theme = s.theme;
    r.dataset.accent = s.customAccent ? 'custom' : s.accent;
    r.dataset.font = s.font;
    r.dataset.motion = s.motion === 'reduced' ? 'reduced' : 'full';
    r.dataset.contrast = s.contrast === 'high' ? 'high' : 'normal';
    r.dataset.ambience = s.ambience || 'full';
    document.body.classList.toggle('compact-mode', !!s.compactMode);
    applyCustomAccent(s.customAccent);
  }

  /** Build a full accent palette from any picked color (stored as hex). */
  let customStyleEl = null;
  function applyCustomAccent(hex) {
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-accent';
      document.head.appendChild(customStyleEl);
    }
    if (!hex) { customStyleEl.textContent = ''; return; }
    const h = hueOfHex(hex);
    const c1 = `hsl(${h} 86% 63%)`, c2 = `hsl(${(h + 42) % 360} 82% 62%)`, c3 = `hsl(${(h + 302) % 360} 78% 68%)`;
    customStyleEl.textContent = `
      :root[data-accent='custom'] {
        --ac1: ${c1}; --ac2: ${c2}; --ac3: ${c3};
        --grad: linear-gradient(120deg, ${c1}, ${c2});
        --ring: hsla(${h}, 86%, 63%, .32);
      }`;
  }

  function hueOfHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 258;
    const n = parseInt(m[1], 16);
    const rr = ((n >> 16) & 255) / 255, gg = ((n >> 8) & 255) / 255, bb = (n & 255) / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
    if (!d) return 0;
    let h = 0;
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    return Math.round(((h * 60) + 360) % 360);
  }
  function applyAndSave() { applyTheme(); Store.save(); }

  return { render, applyTheme };
})();
