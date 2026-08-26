/* ==========================================================================
   Drift · supabase-client.js
   Single shared Supabase client + setup guard.

   Loads after the supabase-js CDN script (see HTML). If credentials are not
   configured in js/config.js, every page renders a friendly setup overlay
   instead of a broken app.
   ========================================================================== */

window.SB = (() => {
  'use strict';
  const CFG = window.DriftConfig;

  function showSetupScreen() {
    if (document.getElementById('setup-guard')) return;
    const el = document.createElement('div');
    el.id = 'setup-guard';
    el.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:#05060c;color:#e7e9f5;font-family:Inter,system-ui,sans-serif;padding:1.5rem;';
    el.innerHTML = `
      <div style="max-width:640px;width:100%;border:1px solid #2a2d45;border-radius:16px;padding:2rem;background:#0b0d1a;">
        <h1 style="font-size:1.4rem;margin:0 0 .5rem;">⚙️ Setup required — Drift is now a real app</h1>
        <p style="color:#9aa0c3;line-height:1.6;margin:0 0 1rem;">
          This build talks to a real backend. No demo data, no fake users — which means it needs
          a Supabase project to store accounts and messages.
        </p>
        <ol style="color:#9aa0c3;line-height:1.9;margin:0 0 1rem;padding-left:1.2rem;">
          <li>Create a free project at <b style="color:#c7cbf0">supabase.com</b></li>
          <li>Run <code style="color:#7dd3fc">supabase-setup.sql</code> (repo root) in its SQL Editor</li>
          <li>Paste your URL + anon key into <code style="color:#7dd3fc">js/config.js</code></li>
        </ol>
        <p style="color:#666c92;font-size:.85rem;margin:0;">
          Detailed steps in <b>SETUP.md</b>. Refresh this page after editing config.js.
        </p>
      </div>`;
    document.body.appendChild(el);
  }

  function guard() {
    if (!CFG.REAL_MODE || !window.supabase?.createClient) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showSetupScreen);
      } else {
        showSetupScreen();
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

// Guard immediately so pages fail fast & visibly when unconfigured.
window.SB.guard();
