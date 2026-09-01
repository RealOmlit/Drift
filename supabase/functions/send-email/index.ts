// ==========================================================================
// Zeek · send-email Edge Function
//
// Sends real email through Gmail SMTP using an App Password. The browser
// never sees Gmail credentials — it invokes this function with the caller's
// Supabase session, and we verify that session server-side before sending.
//
// Secrets (set with `supabase secrets set ...`):
//   GMAIL_USER           — your@gmail.com
//   GMAIL_APP_PASSWORD   — 16-char Google App Password (2FA required)
//
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.
// ==========================================================================

import nodemailer from 'npm:nodemailer@6.10.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_HOUR = 5;
const sent = new Map(); // userId → recent send timestamps (best-effort per isolate)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Resolve the caller's user via Supabase Auth, or null when unauthorized. */
async function verifyUser(req: Request): Promise<{ id: string } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id as string } : null;
  } catch {
    return null;
  }
}

function allow(userId: string): boolean {
  const now = Date.now();
  const hits = (sent.get(userId) ?? []).filter(t => now - t < 3_600_000);
  sent.set(userId, hits);
  if (hits.length >= MAX_PER_HOUR) return false;
  hits.push(now);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await verifyUser(req);
    if (!user) return json({ error: 'Unauthorized — sign in to Zeek first.' }, 401);

    const body = await req.json().catch(() => null);
    const to = String(body?.to ?? '').trim().toLowerCase();
    const subject = String(body?.subject ?? '').trim();
    const text = body?.text ? String(body.text).slice(0, 10_000) : undefined;
    const html = body?.html ? String(body.html).slice(0, 100_000) : undefined;

    if (!EMAIL_RE.test(to)) return json({ error: 'Invalid recipient address.' }, 400);
    if (!subject) return json({ error: 'Missing subject.' }, 400);

    if (!allow(user.id))
      return json({ error: 'Email limit reached (5/hour) — try again later.' }, 429);

    const GMAIL_USER = Deno.env.get('GMAIL_USER');
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD)
      return json({ error: 'Server email not configured — set GMAIL_USER and GMAIL_APP_PASSWORD secrets.' }, 500);

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const info = await transporter.sendMail({
      from: `Zeek <${GMAIL_USER}>`,
      to,
      subject: subject.slice(0, 200),
      text,
      html,
    });

    return json({ ok: true, messageId: info.messageId });
  } catch (e) {
    return json({ error: e?.message ?? 'Send failed.' }, 500);
  }
});
