/* ==========================================================================
   Drift · config.js
   Central configuration. Everything a deployer may want to touch lives here.
   No secrets belong in this file — the anon key below is public by design;
   access control is enforced by row-level security in supabase-setup.sql.
   ========================================================================== */

window.DriftConfig = {
  APP_NAME: 'Drift',
  TAGLINE: 'Conversations in motion.',
  VERSION: '2.3.2',

  /* ------------------------------------------------------------------
     SUPABASE — the real backend.
     1) Create a free project at https://supabase.com
     2) Run supabase-setup.sql in its SQL Editor
     3) Paste your project's URL + anon key here (Settings → API)
     Until both values are set, pages show a "Setup required" screen.
     Full instructions: SETUP.md
  ------------------------------------------------------------------ */
  SUPABASE_URL: 'https://pqrmvqdjuekaowyqmvkg.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxcm12cWRqdWVrYW93eXFtdmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2ODgzMTgsImV4cCI6MjEwMzI2NDMxOH0.mxafgW6kFB1RjmxxqOj_f_I5T4fCPD0kol8JxU-M8Zw',

  /** True when the real backend is wired up. */
  REAL_MODE: false, // recomputed below

  /**
   * Zephyr AI assistant — powered by AIML API (OpenAI-compatible).
   * 🔒 Paste YOUR key here locally before deploying; never commit it to the
   * public repo (this file ships to every visitor). Get one at
   * aimlapi.com. For production, move the key into a server-side proxy
   * and point AI_PROXY_URL at it instead.
   */
  AI_ENABLED: true,
  AI_PROXY_URL: null,                                   // optional secure proxy
  AI_BASE_URL: 'https://text.pollinations.ai/openai',   // keyless, CORS-friendly
  AI_MODEL: 'openai',
  AI_API_KEY: '',
  AI_KEYLESS: true,                                     // provider needs no API key

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
