/* ==========================================================================
   Drift · leaderboard.js — XP, messages, and followers leaderboards
   with top-3 badges.
   ========================================================================== */

window.Leaderboard = (() => {
  'use strict';

  const TABS = [
    { key: 'xp', label: 'XP', icon: 'zap', metric: u => u.xp || 0, badge1: '🏅 Top 1 Veteran', badge2: '🥈 Top 2 Veteran', badge3: '🥉 Top 3 Veteran' },
    { key: 'msgs', label: 'Messages', icon: 'message', metric: u => u.stats?.msgs || 0, badge1: '🏅 Top 1 Messager', badge2: '🥈 Top 2 Messager', badge3: '🥉 Top 3 Messager' },
    { key: 'followers', label: 'Followers', icon: 'user-plus', metric: u => (u.followers || []).length, badge1: '🏅 Top 1 Popular', badge2: '🥈 Top 2 Popular', badge3: '🥉 Top 3 Popular' }
  ];

  let activeTab = 'xp';

  function renderPage(root) {
    root.innerHTML = `
      <div class="view-inner" style="max-width:640px;">
        <div class="view-head">
          <h1>Leaderboard</h1>
          <p class="sub">Top contributors across Drift</p>
        </div>
        <div class="seg" id="lbTabs" style="margin-bottom:1rem;">
          ${TABS.map(t => `<button data-t="${t.key}" class="${activeTab === t.key ? 'on' : ''}">${U.icon(t.icon, 15)} ${t.label}</button>`).join('')}
        </div>
        <div id="lbList"></div>
      </div>`;

    root.querySelector('#lbTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      activeTab = b.dataset.t;
      root.querySelectorAll('#lbTabs button').forEach(x => x.classList.toggle('on', x === b));
      drawList(root);
    });

    drawList(root);
  }

  async function drawList(root) {
    const box = root.querySelector('#lbList'); if (!box) return;
    const tab = TABS.find(t => t.key === activeTab);
    let profiles = [];
    try {
      profiles = await Store.allProfiles();
    } catch (_) {}
    // Include self
    const me = Store.me();
    if (me && !profiles.find(p => p.id === me.id)) profiles.push(me);

    const sorted = profiles
      .filter(u => tab.metric(u) > 0)
      .sort((a, b) => tab.metric(b) - tab.metric(a))
      .slice(0, 20);

    if (!sorted.length) {
      box.innerHTML = `<div class="empty"><div class="e-icon">${U.icon(tab.icon, 26)}</div>
        <h4>No data yet</h4><p>Be the first to appear on the ${tab.label} leaderboard!</p></div>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    box.innerHTML = sorted.map((u, i) => {
      const val = tab.metric(u);
      const medal = i < 3 ? medals[i] : '';
      const topClass = i < 3 ? ' lb-top' : '';
      const nameStyle = U.nameClasses(u);
      return `
        <div class="card lb-row${topClass}" data-user-card="${u.id}" style="display:flex;align-items:center;gap:.8rem;padding:.7rem 1rem;margin-bottom:.45rem;${i < 3 ? 'border:1px solid var(--brd-2);' : ''}">
          <span class="trend-rank" style="min-width:28px;font-size:1.1rem;">${medal || (i + 1)}</span>
          ${U.avatar(u, { size: 40, presence: true })}
          <div class="grow" style="min-width:0;">
            <div style="font-weight:700;font-size:.92rem;" class="${nameStyle}">${U.esc(u.displayName)}</div>
            <div class="small faint">@${U.esc(u.username)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;font-family:var(--font-d);font-size:1.05rem;">${U.fmtCount(val)}</div>
            <div class="small faint">${tab.key === 'xp' ? 'XP' : tab.key === 'msgs' ? 'msgs' : 'followers'}</div>
          </div>
        </div>`;
    }).join('');

    box.onclick = e => {
      const card = e.target.closest('[data-user-card]');
      if (card) People.openProfileCard(card.dataset.userCard);
    };
  }

  /** Check leaderboard rankings and award top-3 badges. Called on boot + profile load. */
  function checkBadges(allUsers) {
    if (!allUsers || !allUsers.length) return;
    const me = Store.me();
    if (!me) return;
    const badges = me.badges || [];
    let changed = false;

    for (const tab of TABS) {
      const sorted = allUsers
        .filter(u => tab.metric(u) > 0)
        .sort((a, b) => tab.metric(b) - tab.metric(a));
      const myRank = sorted.findIndex(u => u.id === me.id);

      const badgeKeys = [
        { rank: 0, badge: tab.badge1 },
        { rank: 1, badge: tab.badge2 },
        { rank: 2, badge: tab.badge3 }
      ];

      for (const { rank, badge } of badgeKeys) {
        if (myRank === rank && !badges.includes(badge)) {
          badges.push(badge);
          changed = true;
        } else if (myRank !== rank && badges.includes(badge)) {
          badges.splice(badges.indexOf(badge), 1);
          changed = true;
        }
      }
    }

    if (changed) {
      me.badges = badges;
      Store.touchProfile();
    }
  }

  return { renderPage, checkBadges };
})();
