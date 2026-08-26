/* ==========================================================================
   Drift · email.js — real outgoing mail via the send-email Edge Function.
   The browser never touches Gmail credentials: it asks Supabase to invoke
   the function, which verifies the caller's session server-side, applies a
   rate limit and relays through Gmail SMTP. See SETUP.md → "Real emails".

   Public API: configured(), send(), welcome()
   ========================================================================== */

window.Email = (() => {
  'use strict';

  function configured() {
    return Boolean(SB.configured() && typeof SB.client.functions?.invoke === 'function');
  }

  /**
   * Send an email through the send-email Edge Function.
   * @param {{to:string, subject:string, html?:string, text?:string}} opts
   */
  async function send({ to, subject, html, text }) {
    if (!configured()) throw new Error('Email isn\u2019t wired up yet.');
    const { data, error } = await SB.client.functions.invoke('send-email', {
      body: { to, subject, html, text }
    });
    if (error) throw new Error(error.message || 'Email failed to send.');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Branded welcome message for brand-new drifters. */
  function welcomeMail({ username, displayName }) {
    const name = esc(displayName || username || 'there');
    const handle = esc(username ? '@' + username : '');
    return {
      subject: 'Welcome to Drift ✦ your room key is ready',
      text:
        `Welcome to Drift, ${displayName || username}!\n\n` +
        `Your account is live — jump into a room, say hi, and meet people drifting in real time.\n` +
        `${location.origin}/app.html\n\n— The Drift team`,
      html: `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#05060c;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#0b0d1a;border:1px solid #2a2d45;border-radius:16px;padding:36px 32px;">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:.5px;">Dri<span style="background:linear-gradient(90deg,#22D3EE,#7C5CFF,#F472B6);-webkit-background-clip:text;background-clip:text;color:transparent;">ft</span></div>
      <h1 style="color:#fff;font-size:22px;margin:24px 0 10px;">Welcome aboard, ${name}! 👋</h1>
      <p style="color:#c7cbf0;font-size:15px;line-height:1.65;margin:0 0 8px;">
        ${handle ? `<b style="color:#fff;">${handle}</b> is live and ready.` : 'Your account is live and ready.'}
        Drift is real people in real rooms — messages sync instantly, presence is genuine,
        and Zephyr AI is around whenever the chat goes quiet.
      </p>
      <p style="margin:26px 0;">
        <a href="${esc(location.origin)}/app.html"
           style="display:inline-block;background:linear-gradient(135deg,#7C5CFF,#F472B6);color:#fff;
                  text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:12px;">
          Open Drift →
        </a>
      </p>
      <p style="color:#9aa0c3;font-size:12.5px;line-height:1.6;margin:28px 0 0;border-top:1px solid #2a2d45;padding-top:18px;">
        You received this because someone created a Drift account with this address.
        Not you? Just ignore it — nothing else will be sent unless you use the app.
      </p>
    </div>
    <p style="color:#666c92;font-size:11.5px;text-align:center;margin:18px 0 0;">© ${new Date().getFullYear()} Drift · conversations in motion</p>
  </div>
</body></html>`
    };
  }

  /** Fire the welcome email for a fresh signup. Never throws. */
  async function welcome(profile) {
    try {
      if (!profile?.email) return false;
      const { subject, html, text } = welcomeMail(profile);
      await send({ to: profile.email, subject, html, text });
      return true;
    } catch (e) {
      console.warn('[Drift] welcome email skipped:', e.message);
      return false;
    }
  }

  return { configured, send, welcome };
})();
