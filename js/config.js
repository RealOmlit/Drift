/* ==========================================================================
   Drift · config.js
   Central configuration. Everything a deployer may want to touch lives here.
   No secrets belong in this file — the anon key below is public by design;
   access control is enforced by row-level security in supabase-setup.sql.
   ========================================================================== */

window.DriftConfig = {
  APP_NAME: 'Drift',
  TAGLINE: 'Conversations in motion.',
  VERSION: '2.0.0',

  /* ------------------------------------------------------------------
     SUPABASE — the real backend.
     1) Create a free project at https://supabase.com
     2) Run supabase-setup.sql in its SQL Editor
     3) Paste your project's URL + anon key here (Settings → API)
     Until both values are set, pages show a "Setup required" screen.
     Full instructions: SETUP.md
  ------------------------------------------------------------------ */
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  /** True when the real backend is wired up. */
  REAL_MODE: false, // recomputed below

  /**
   * Zephyr AI assistant. Disabled by default: there is no fake offline
   * engine anymore. Point AI_PROXY_URL at a serverless function that holds
   * YOUR API key server-side, then set AI_ENABLED to true.
   */
  AI_ENABLED: false,
  AI_PROXY_URL: null,

  /** localStorage namespace — UI prefs only (theme, sounds, muted users…). */
  STORAGE_PREFIX: 'drift.v2.',

  /** How many recent messages are loaded per room. */
  MESSAGE_WINDOW: 60,

  /** Presence heartbeat interval (ms). */
  PRESENCE_TICK_MS: 30000
};

// Real mode is on only when both credentials look filled in.
window.DriftConfig.REAL_MODE = Boolean(
  window.DriftConfig.SUPABASE_URL &&
  /^https:\/\/.+/.test(window.DriftConfig.SUPABASE_URL) &&
  window.DriftConfig.SUPABASE_ANON_KEY &&
  window.DriftConfig.SUPABASE_ANON_KEY.length > 20
);
