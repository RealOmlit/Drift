/* ==========================================================================
   Drift · supabase-client.js
   Single shared Supabase client + a light setup reminder.

   Loads after the supabase-js CDN script (see HTML). If credentials are not
   configured in js/config.js:
     · landing page  → small dismissible corner note
     · app pages     → a one-time inline panel (they can't work without data)
   Nothing blocks or redirects; dismissing is remembered for the session.
   ========================================================================== */

window.SB = (() => {
  'use strict';
  const CFG = window.DriftConfig;
  const DISMISS_KEY = CFG.STORAGE_PREFIX + 'setupDismissed';

  const isLanding = () =>
    /(^|\/)index\.html$/.test(location.pathname) || location.pathname.endsWith('/');

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
    document.getElementById('drift-setup-note')?.remove();
  }

  function dismissed() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  /* Corner note — used on the landing page only. */
  function showCornerNote() {
    if (dismissed() || document.getElementById('drift-setup-note')) return;
    const el = document.createElement('div');
    el.id = 'drift-setup-note';
    el.style.cssText =
      'position:fixed;left:14px;bottom:14px;z-index:99999;max-width:340px;' +
      'background:#0b0d1a;color:#c7cbf0;border:1px solid #2a2d45;border-radius:12px;' +
      'padding:.7rem .9rem;font:13px/1.5 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);';
    el.innerHTML = `
      <div style="display:flex;gap:.6rem;align-items:flex-start;">
        <span style="flex:none;">⚙️</span>
        <div><b>Chat not connected yet.</b>
          <span style="color:#9aa0c3;">Add your free Supabase keys in <code style="color:#7dd3fc">js/config.js</code> — see SETUP.md.</span>
        </div>
        <button id="drift-setup-x" aria-label="Dismiss"
          style="flex:none;background:none;border:none;color:#666c92;font-size:15px;cursor:pointer;line-height:1;padding:2px;">✕</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#drift-setup-x').addEventListener('click', dismiss);
  }

  /* Centered panel — app/login/signup can't function without a database. */
  function showSetupPanel() {
    if (document.getElementById('drift-setup-note')) return;
    const el = document.createElement('div');
    el.id = 'drift-setup-note';
    el.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:#05060c;color:#e7e9f5;font-family:Inter,system-ui,sans-serif;padding:1.5rem;';
    el.innerHTML = `
      <div style="max-width:520px;width:100%;border:1px solid #2a2d45;border-radius:16px;padding:1.8rem;background:#0b0d1a;">
        <h1 style="font-size:1.25rem;margin:0 0 .6rem;">⚙️ One-time setup</h1>
        <p style="color:#9aa0c3;line-height:1.65;margin:0 0 1rem;">
          Drift stores accounts and messages in a free Supabase database.
          Connect yours and this screen disappears forever:
        </p>
        <ol style="color:#9aa0c3;line-height:1.9;margin:0 0 1.1rem;padding-left:1.2rem;">
          <li>Create a project at <b style="color:#c7cbf0">supabase.com</b> (free)</li>
          <li>Run <code style="color:#7dd3fc">supabase-setup.sql</code> in its SQL Editor</li>
          <li>Paste the URL + anon key into <code style="color:#7dd3fc">js/config.js</code></li>
        </ol>
        <p style="color:#666c92;font-size:.85rem;margin:0;">
          Full walkthrough in <b>SETUP.md</b>. Refresh after editing config.js.
        </p>
      </div>`;
    document.body.appendChild(el);
  }

  function guard() {
    if (!CFG.REAL_MODE || !window.supabase?.createClient) {
      const run = () => (isLanding() ? showCornerNote() : showSetupPanel());
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
      } else {
        run();
      }
      return false;
    }
    return true;
  }

  const client = (CFG.REAL_MODE && window.supabase?.createClient)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  /** Small helper: throw readable errors from PostgREST responses. */
  async function unwrap(promise) {
    const { data, error } = await promise;
    if (error) {
      const msg = error.message || error.msg || String(error);
      const e = new Error(msg.replace(/^AuthApiError:\s*/i, ''));
      e.cause = error;
      throw e;
    }
    return data;
  }

  return { client, guard, unwrap, configured: () => !!client };
})();

// Light check on load — shows a note when unconfigured, nothing more.
window.SB.guard();
