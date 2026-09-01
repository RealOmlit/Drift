/* ==========================================================================
   Zeek · activities.js — mini activities launched inside rooms.
   Results are posted into the chat as special activity messages.
   ========================================================================== */

window.Activities = (() => {
  'use strict';

  function rootEl() {
    let r = U.$('#game-root');
    if (!r) { r = U.el('div', { id: 'game-root', class: 'game-stage' }); document.body.appendChild(r); }
    return r;
  }

  function menu(anchor, roomId) {
    UI.menu(anchor, [
      { header: true, label: 'Launch an activity' },
      { label: '⚡ Reaction Race', icon: 'zap', onClick: () => launch('race', roomId) },
      { label: '🧠 Trivia Rush (3 questions)', icon: 'bulb', onClick: () => launch('trivia', roomId) }
    ]);
  }

  function closeStage() {
    const r = rootEl();
    r.classList.remove('open');
    setTimeout(() => { r.innerHTML = ''; }, 200);
  }

  /* ============================== Reaction Race ============================== */
  function race(roomId) {
    const stage = rootEl();
    stage.innerHTML = `
      <div class="game-panel">
        <h3 style="font-family:var(--font-d);">⚡ Reaction Race</h3>
        <p class="muted small" style="margin-top:.3rem;">Wait for <b style="color:var(--ok)">GREEN</b>, then click as fast as you can.</p>
        <div class="game-pad wait" id="racePad">Get ready…</div>
        <div class="small faint" id="raceHint">False starts count against you 😈</div>
        <button class="btn btn-glass btn-sm" id="raceQuit" style="margin-top:1rem;">Leave</button>
      </div>`;
    stage.classList.add('open');

    const pad = U.$('#racePad');
    let phase = 'wait', t0 = 0, armT = 0;

    armT = setTimeout(() => {
      pad.classList.remove('wait'); pad.classList.add('go');
      pad.textContent = 'CLICK!'; phase = 'go';
      t0 = performance.now();
    }, U.randInt(1300, 3400));

    pad.addEventListener('click', () => {
      if (phase === 'wait') {
        clearTimeout(armT);
        phase = 'done';
        pad.classList.remove('wait'); pad.classList.add('done');
        pad.textContent = 'Too early! 🙈';
        finish(roomId, null);
      } else if (phase === 'go') {
        const ms = Math.round(performance.now() - t0);
        phase = 'done';
        pad.classList.remove('go'); pad.classList.add('done');
        pad.textContent = `${ms} ms`;
        U.$('#raceHint').textContent = ms < 220 ? 'Lightning reflexes! ⚡' : ms < 320 ? 'Solid twitch.' : 'The sloth thanks you.';
        finish(roomId, ms);
      }
    });
    U.$('#raceQuit').addEventListener('click', () => { clearTimeout(armT); closeStage(); });
  }

  /* =============================== Trivia Rush =============================== */
  /* Static question bank — game content, not simulated users. */
  const TRIVIA = [
    { q: 'Which data structure works on FIFO?', o: ['Stack', 'Queue', 'Tree', 'Heap'], a: 1 },
    { q: 'What does "HTTP" stand for?', o: ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'HyperTransfer Type Protocol', 'Home Tool Markup Protocol'], a: 0 },
    { q: 'Which planet has the most moons?', o: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], a: 1 },
    { q: 'In CSS, which property stacks elements on top of each other?', o: ['float', 'z-index', 'overflow', 'position-table'], a: 1 },
    { q: 'What year did the first iPhone launch?', o: ['2005', '2006', '2007', '2008'], a: 2 },
    { q: 'Which language runs natively in web browsers?', o: ['Python', 'C++', 'JavaScript', 'Ruby'], a: 2 },
    { q: 'What is the chemical symbol for gold?', o: ['Go', 'Gd', 'Au', 'Ag'], a: 2 },
    { q: 'Which company developed the React library?', o: ['Google', 'Meta (Facebook)', 'Microsoft', 'Twitter'], a: 1 },
    { q: 'How many bits are in a byte?', o: ['4', '8', '16', '32'], a: 1 },
    { q: 'Which ocean is the largest?', o: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], a: 3 },
    { q: 'In Git, which command stages all changes?', o: ['git push', 'git add .', 'git commit -a!', 'git stage --all'], a: 1 },
    { q: 'What does CPU stand for?', o: ['Central Process Unit', 'Computer Personal Unit', 'Central Processing Unit', 'Core Processing Utility'], a: 2 }
  ];

  function trivia(roomId) {
    const questions = U.shuffle(TRIVIA).slice(0, 3);
    let idx = 0, score = 0;
    const stage = rootEl();

    function draw() {
      const q = questions[idx];
      stage.innerHTML = `
        <div class="game-panel">
          <div class="spread"><h3 style="font-family:var(--font-d);">🧠 Trivia Rush</h3><span class="badge badge-ai">${idx + 1}/3</span></div>
          <p style="margin:.8rem 0 .4rem;font-weight:600;">${U.esc(q.q)}</p>
          <div class="trivia-opts">
            ${q.o.map((o, i) => `<button data-i="${i}">${U.esc(o)}</button>`).join('')}
          </div>
          <div class="small faint">Score: ${score}</div>
        </div>`;
      stage.classList.add('open');
      stage.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        const pick = +b.dataset.i;
        stage.querySelectorAll('[data-i]').forEach((x, i) => {
          x.disabled = true;
          if (i === q.a) x.classList.add('right');
          else if (i === pick) x.classList.add('wrong');
        });
        if (pick === q.a) score++;
        setTimeout(() => {
          idx++;
          idx < 3 ? draw() : done();
        }, 900);
      }));
    }

    function done() {
      const medal = score === 3 ? '🏆 Flawless!' : score === 2 ? '🎯 Sharp!' : '📚 Study more, we beg';
      stage.querySelector('.game-panel').innerHTML = `
        <h3 style="font-family:var(--font-d);">${medal}</h3>
        <p class="muted" style="margin:.6rem 0;">You scored <b>${score}/3</b>. Result posted to the room.</p>
        <button class="btn btn-primary" id="tvDone">Back to chat</button>`;
      U.$('#tvDone').addEventListener('click', () => { closeStage(); postResult(roomId, `trivia`, `Trivia Rush · ${medal.split(' ')[0]}`, `scored ${score}/3`); });
    }
    draw();
  }

  /* ------------------------------- plumbing ------------------------------- */
  function finish(roomId, ms) {
    setTimeout(() => {
      closeStage();
      if (ms != null) {
        postResult(roomId, 'reaction-race',
          `${Store.me().displayName} won Reaction Race`,
          `${ms}ms reaction time`);
        Store.addXP(ms < 250 ? 20 : 12, 'Reaction Race');
      } else {
        Store.composeMessage(roomId, 'me', '', {
          type: 'activity',
          meta: { game: 'reaction-race', headline: `${Store.me().displayName} jumped the gun`, detail: 'false start — the crowd gasps' }
        });
      }
      Store.me().stats.gamesPlayed++;
      Store.questProgress('pulse');
    }, 1100);
  }

  function postResult(roomId, game, headline, detail) {
    Store.composeMessage(roomId, 'me', '', {
      type: 'activity',
      meta: { game, headline, detail }
    });
  }

  function launch(type, roomId) { type === 'trivia' ? trivia(roomId) : race(roomId); }

  return { menu, launch };
})();
