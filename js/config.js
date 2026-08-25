/* ==========================================================================
   Drift · config.js
   Central configuration. Everything a deployer may want to touch lives here.
   NOTE: This is a FRONT-END DEMO build. No secrets belong in this file.
   ========================================================================== */

window.DriftConfig = {
  APP_NAME: 'Drift',
  TAGLINE: 'Conversations in motion.',
  VERSION: '1.0.0',

  /**
   * Backend provider for the demo.
   *  'demo'      → everything runs locally in the browser (localStorage).
   *  'supabase'  → wire up js/backend.js (see README → "Connect Supabase").
   *  'firebase'  → wire up js/backend.js (see README → "Connect Firebase").
   * The UI stays identical in all modes.
   */
  BACKEND_PROVIDER: 'demo',

  /**
   * AI assistant ("Zephyr") configuration.
   * SECURITY: Never put a real API key here or anywhere in front-end code.
   * Point AI_PROXY_URL at YOUR serverless function / edge function that
   * forwards requests to OpenAI / Anthropic / etc. with the key kept server-side.
   * When left null, Zephyr falls back to the built-in offline demo engine.
   */
  AI_PROXY_URL: null, // e.g. 'https://your-worker.workers.dev/api/zephyr'

  /** Simulated presence baseline used by the demo presence engine. */
  PRESENCE_BASELINE: 1284,

  /** localStorage namespace — bump to invalidate old demo data. */
  STORAGE_PREFIX: 'drift.v1.',

  /** Demo behaviour knobs */
  SIM: {
    botMessageMinMs: 14000,   // min delay between ambient bot messages
    botMessageMaxMs: 34000,
    typingLeadMs: 1800,       // how long bots "type" before a message lands
    presenceTickMs: 9000,
    notifChance: 0.22         // chance per tick of a simulated notification
  }
};
