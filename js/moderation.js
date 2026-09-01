/* ==========================================================================
   Zeek · moderation.js — reports, mutes, blocks and the report dashboard.
   Reports are stored in the reports table (visible to the project operator);
   mutes/blocks are enforced locally in your browser.
   ========================================================================== */

window.Mod = (() => {
  'use strict';

  const isMuted = id => Store.state.meta.mutedUsers.includes(id);
  const isBlocked = id => Store.state.meta.blockedUsers.includes(id);

  /* ------------------------------ mutes/blocks ------------------------------ */
  function toggleMute(userId) {
    const u = Store.getUser(userId); if (!u) return;
    const list = Store.state.meta.mutedUsers;
    const i = list.indexOf(userId);
    if (i >= 0) { list.splice(i, 1); UI.toast({ title: `${u.displayName} unmuted`, type: 'info', icon: 'volume' }); }
    else {
      list.push(userId);
      Notifs.push('system', { title: `${u.displayName} muted`, body: 'Their messages appear dimmed and never notify you.', silent: true });
    }
    Store.save();
    Chat.rerender();
  }

  async function toggleBlock(userId) {
    const u = Store.getUser(userId); if (!u) return;
    const list = Store.state.meta.blockedUsers;
    if (list.includes(userId)) {
      list.splice(list.indexOf(userId), 1);
      UI.toast({ title: `${u.displayName} unblocked`, type: 'ok', icon: 'check' });
    } else {
      if (!(await UI.confirm({
        title: `Block ${u.displayName}?`,
        body: 'Their messages will be hidden everywhere and they can\'t interact with you.',
        okLabel: 'Block', danger: true
      }))) return;
      list.push(userId);
      addReport({ kind: 'block', userId, reason: 'User blocked' });
      UI.toast({ title: `${u.displayName} blocked`, type: 'warn', icon: 'ban' });
    }
    Store.save();
    Chat.rerender();
  }

  /* -------------------------------- reports -------------------------------- */
  /** Persist a report to the database and mirror it into local state. */
  function addReport({ kind, messageId, roomId, userId, reason, note }) {
    Store.fileReport({
      kind, messageId, roomId, userId,
      reason: reason || note || 'unspecified'
    }).catch(e => UI.toast({ title: 'Report failed to send', body: e.message, type: 'bad', icon: 'alert' }));
    Store.emit('reports:update');
  }

  const REASONS = ['Spam or scams', 'Harassment or hate', 'Misinformation', 'Inappropriate content', 'Something else'];

  /** Report modal for a message. */
  function reportMessage(msg, roomId) {
    const m = UI.openModal({
      slim: true,
      title: `${U.icon('flag', 17)} Report message`,
      body: `
        <div class="card" style="margin-bottom:.9rem;opacity:.75;font-size:.85rem;">“${U.esc(msg.text.slice(0, 120))}${msg.text.length > 120 ? '…' : ''}”</div>
        ${REASONS.map((r, i) => `
          <label class="row" style="padding:.5rem .2rem;cursor:pointer;">
            <input type="radio" name="repreason" value="${r}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--ac1);">
            <span style="font-size:.9rem;">${r}</span>
          </label>`).join('')}`,
      footer: `<button class="btn btn-glass" data-close2>Cancel</button>
               <button class="btn btn-danger" id="repGo">Submit report</button>`
    });
    m.card.querySelector('[data-close2]').addEventListener('click', m.close);
    m.card.querySelector('#repGo').addEventListener('click', () => {
      const reason = m.card.querySelector('input[name="repreason"]:checked').value;
      addReport({ kind: 'message', messageId: msg.id, roomId, reason, userId: msg.userId });
      m.close();
      UI.toast({ title: 'Report sent', body: 'Moderators will take a look.', type: 'ok', icon: 'shield' });
    });
  }

  /** Report modal for a user. */
  function reportUser(userId) {
    const u = Store.getUser(userId); if (!u) return;
    const m = UI.openModal({
      slim: true,
      title: `${U.icon('flag', 17)} Report @${U.esc(u.username)}`,
      body: REASONS.map((r, i) => `
        <label class="row" style="padding:.5rem .2rem;cursor:pointer;">
          <input type="radio" name="repu" value="${r}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--ac1);">
          <span style="font-size:.9rem;">${r}</span>
        </label>`).join(''),
      footer: `<button class="btn btn-glass" data-close2>Cancel</button>
               <button class="btn btn-danger" id="repUGo">Submit report</button>`
    });
    m.card.querySelector('[data-close2]').addEventListener('click', m.close);
    m.card.querySelector('#repUGo').addEventListener('click', () => {
      const reason = m.card.querySelector('input[name="repu"]:checked').value;
      addReport({ kind: 'user', userId, reason });
      m.close();
      UI.toast({ title: 'Report sent', body: `@${u.username} has been reported.`, type: 'ok', icon: 'shield' });
    });
  }

  /** Escalate a report: recorded for the project operator to review. */
  function escalate(report) {
    if (!report) return;
    report.status = 'escalated';
    Store.save();
    UI.toast({ title: 'Escalated', body: 'The report was flagged for review.', type: 'warn', icon: 'shield' });
  }

  /* --------------------------- moderation dashboard ---------------------------
     Rendered inside Settings → Moderation. Shows open reports with actions. */
  function dashboardHTML() {
    const reports = Store.state.reports;
    if (!reports.length) {
      return `<div class="empty"><div class="e-icon">${U.icon('shield', 24)}</div>
        <h4>No open reports</h4><p>Your community is running smooth as silk.</p></div>`;
    }
    return reports.map(r => {
      const u = r.userId ? Store.getUser(r.userId) : null;
      const room = r.roomId ? Store.getRoom(r.roomId) : null;
      return `
      <div class="card set-row">
        <div class="s-main">
          <b>${r.kind === 'user' ? `User report · @${U.esc(u?.username || '?')}` : r.kind === 'message' ? `Message report` : `Action`} <span class="badge ${r.status === 'open' ? 'badge-hot' : 'badge-new'}">${r.status}</span></b>
          <p>${U.esc(r.reason)}${r.kind === 'message' ? ` · “${U.esc(String(Store.roomMessages(r.roomId).find(x => x.id === r.messageId)?.text || '').slice(0, 60))}”` : ''}</p>
          <p>${room ? `in #${U.esc(room.name)} · ` : ''}${U.fmtRel(r.ts)}</p>
        </div>
        ${r.status === 'open' ? `
          <div class="row">
            <button class="btn btn-glass btn-sm" data-resolve="${r.id}">Dismiss</button>
            ${r.kind !== 'block' ? `<button class="btn btn-danger btn-sm" data-esc="${r.id}">${U.icon('shield', 13)} Escalate</button>` : ''}
          </div>` : ''}
      </div>`;
    }).join('');
  }

  function bindDashboard(root) {
    root.addEventListener('click', e => {
      const res = e.target.closest('[data-resolve]');
      const esc = e.target.closest('[data-esc]');
      if (res) { const r = Store.state.reports.find(x => x.id === res.dataset.resolve); if (r) r.status = 'dismissed'; Store.save(); refresh(root); }
      if (esc) { escalate(Store.state.reports.find(x => x.id === esc.dataset.esc)); refresh(root); }
    });
  }
  const refresh = root => { const wrap = U.$('#modDash'); if (wrap) wrap.innerHTML = dashboardHTML(); };

  return { isMuted, isBlocked, toggleMute, toggleBlock, reportMessage, reportUser, dashboardHTML, bindDashboard };
})();
