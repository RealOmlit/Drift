/* ==========================================================================
   Zeek · supabase-client.js
   Single shared Supabase client + a light setup reminder.

   Loads after the supabase-js CDN script (see HTML). When credentials are
   present in js/config.js this module is invisible. Without them the site
   still renders normally; only the landing page shows a small dismissible
   corner note, and sign-in attempts explain what's missing.
   ========================================================================== */

window.SB = (() => {
  'use strict';
  const CFG = window.ZeekConfig;
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

  /* Corner note — landing page only, never blocks anything. */
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

  function guard() {
    if (!CFG.REAL_MODE || !window.supabase?.createClient) {
      if (isLanding()) {
        const run = () => showCornerNote();
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', run);
        } else {
          run();
        }
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

  let authErrorHandler = null;
  let isHandlingAuthError = false;
  function setAuthErrorHandler(fn) { authErrorHandler = fn; }

  /** Small helper: throw readable errors from PostgREST responses. */
  async function unwrap(promise) {
    const { data, error } = await promise;
    if (error) {
      const msg = error.message || error.msg || String(error);
      const e = new Error(msg.replace(/^AuthApiError:\s*/i, ''));
      e.cause = error;
      const isAuthError = error.code === 'PGRST301' || error.status === 401 || /JWT|unauthorized|auth/i.test(msg);
      if (isAuthError) {
        e.name = 'AuthError';
        if (authErrorHandler && !isHandlingAuthError) {
          isHandlingAuthError = true;
          try { authErrorHandler(e); } finally { isHandlingAuthError = false; }
        }
      }
      throw e;
    }
    return data;
  }

  return { client, guard, unwrap, configured: () => !!client, setAuthErrorHandler };
})();

// Light check on load — a corner note on the landing page, nothing more.
window.SB.guard();
