/* ==========================================================================
   Drift · auth.js — REAL authentication backed by Supabase Auth.
   Sessions, emails and passwords are handled server-side by Supabase;
   profile rows live in public.profiles (created by an SQL trigger on signup).

   Public API: current(), signUp(), signIn(), signOut(), restore(),
   requireAuth(), redirectIfAuthed(), changePassword(), changeUsername(),
   changeEmail(), validateUsername(), passwordStrength(), resendConfirmation()
   ========================================================================== */

window.Auth = (() => {
  'use strict';

  const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const current = () => Store.state.profile ? Store.me() : null;

  /* ------------------------------ validation ------------------------------ */
  function passwordStrength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) || /[^A-Za-z0-9]/g.test(pw)) s++;
    return Math.min(s, 4);
  }

  /** Async now — uniqueness is enforced by the database. */
  async function validateUsername(u) {
    if (!USERNAME_RE.test(u)) return '3–20 chars, letters, numbers, underscores.';
    if (['me', 'zephyr', 'system'].includes(u.toLowerCase())) return 'That name is reserved.';
    try {
      const rows = await SB.unwrap(
        SB.client.from('profiles').select('id').ilike('username', u).limit(1)
      );
      // Ignore a hit that belongs to the signed-in user themself (rename flow).
      const uid = SB.client.auth.getUser()?.data?.user?.id;
      if (rows.length && rows[0].id !== uid) return 'That username is taken.';
    } catch (e) {
      if (/taken|duplicate/i.test(e.message)) return 'That username is taken.';
      throw e;
    }
    return null;
  }

  /** Absolute URL of login.html on whatever host we're currently on —
      used as the landing spot after a user clicks "Confirm" in email. */
  function emailRedirectTo() {
    try { return new URL('login.html', location.href).href; }
    catch (e) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'login.html'; }
  }

  /* ------------------------------- sign up ------------------------------- */
  async function signUp({ username, email, password, displayName, avatarEmoji = '', hue = null }) {
    if (!SB.configured()) throw new Error('This site isn\u2019t connected to its chat database yet.');
    username = (username || '').trim();
    email = (email || '').trim().toLowerCase();
    const err = await validateUsername(username);
    if (err) throw new Error(err);
    if (!EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.');
    if ((password || '').length < 8) throw new Error('Password needs at least 8 characters.');

    let res;
    try {
      res = await SB.unwrap(
        SB.client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: emailRedirectTo(),
            data: {
              username,
              display_name: (displayName || username).trim(),
              avatar_emoji: avatarEmoji,
              hue: hue ?? U.hueOf(username)
            }
          }
        })
      );
    } catch (e) {
      // Unconfirmed signup from an earlier attempt → account exists but is
      // dormant. Point the user at login (which can resend the link).
      if (/already registered|already exists|duplicate/i.test(e.message)) {
        const err2 = new Error('That email already has an account — try logging in. Never verified it? The login screen can resend the link.');
        err2.exists = true;
        err2.email = email;
        throw err2;
      }
      throw e;
    }

    // Email confirmation disabled → session exists right away.
    if (!res.session) {
      return { pendingConfirmation: true };
    }
    await Store.ensureProfile(res.user);
    await Store.afterLogin();
    return Store.state.profile;
  }

  /* -------------------------------- log in -------------------------------- */
  async function signIn(identifier, password /* remember kept for API compat */) {
    if (!SB.configured()) throw new Error('This site isn\u2019t connected to its chat database yet.');
    identifier = (identifier || '').trim();
    let email = identifier.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      // Username login → resolve email server-side.
      email = await SB.unwrap(SB.client.rpc('username_to_email', { u: identifier }));
      if (!email) throw new Error('No account found for that username.');
    }
    try {
      await SB.unwrap(
        SB.client.auth.signInWithPassword({ email, password })
      );
    } catch (e) {
      // Account exists but was never verified — recoverable, not lost.
      if (/not confirmed|confirm/i.test(e.message)) {
        const err = new Error('Your email hasn\u2019t been verified yet — check your inbox for the confirmation link.');
        err.unconfirmed = true;
        err.email = email;
        throw err;
      }
      throw e;
    }
    const { data } = await SB.client.auth.getUser();
    await Store.ensureProfile(data.user);
    await Store.afterLogin();
    return Store.state.profile;
  }

  /** Re-send the signup confirmation email (used when login says "unconfirmed"). */
  async function resendConfirmation(email) {
    if (!SB.configured()) throw new Error('This site isn\u2019t connected to its chat database yet.');
    const { error } = await SB.client.auth.resend({
      type: 'signup',
      email: (email || '').trim().toLowerCase(),
      options: { emailRedirectTo: emailRedirectTo() }
    });
    if (error) throw new Error(error.message || 'Couldn\u2019t send the email.');
    return true;
  }

  /** Send a password-reset email. The link signs the user in; they can set
      a new password afterwards from Settings → Account. */
  async function requestPasswordReset(email) {
    if (!SB.configured()) throw new Error('This site isn\u2019t connected to its chat database yet.');
    email = (email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
    const { error } = await SB.client.auth.resetPasswordForEmail(email, {
      redirectTo: emailRedirectTo()
    });
    if (error) throw new Error(error.message || 'Couldn\u2019t send the email.');
    return true;
  }

  /* ------------------------------- log out ------------------------------- */
  async function signOut() {
    try { await SB.client.auth.signOut(); } catch (e) {}
    Backend.stop();
    Store.forgetSession();
    location.href = './login.html?loggedOut=1';
  }

  /* --------------------------- account upkeep ---------------------------- */
  async function changePassword(_oldPw, newPw) {
    if ((newPw || '').length < 8) throw new Error('New password needs at least 8 characters.');
    await SB.unwrap(SB.client.auth.updateUser({ password: newPw }));
  }

  async function changeUsername(newName) {
    newName = (newName || '').trim();
    const err = await validateUsername(newName);
    if (err) throw new Error(err);
    await SB.unwrap(
      SB.client.from('profiles').update({ username: newName }).eq('id', Store.me().id)
    );
    try {
      await SB.client.auth.updateUser({ data: { username: newName } });
    } catch (e) { /* metadata refresh is best-effort */ }
    Store.me().username = newName;
  }

  async function changeEmail(newEmail) {
    newEmail = (newEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(newEmail)) throw new Error('Enter a valid email address.');
    await SB.unwrap(SB.client.auth.updateUser({ email: newEmail }));
  }

  /* ----------------------------- page guards ----------------------------- */
  /** Restore the session (async). Returns true when a user is signed in. */
  async function restore() {
    if (!SB.configured()) return false;
    const { data } = await SB.client.auth.getSession();
    const user = data?.session?.user;
    if (!user) return false;
    await Store.ensureProfile(user);
    // Hydrate rooms/messages/notifications — needed on every reload, not
    // just right after sign-in.
    try { await Store.afterLogin(); }
    catch (e) { console.warn('[Drift] data hydration failed:', e.message); }
    return true;
  }

  async function requireAuth() {
    if (!(await restore())) { location.replace('./login.html'); return false; }
    return true;
  }

  async function redirectIfAuthed() {
    if (await restore()) { location.replace('./app.html'); return true; }
    return false;
  }

  return {
    current, signUp, signIn, signOut, restore,
    requireAuth, redirectIfAuthed, changePassword, changeUsername, changeEmail,
    validateUsername, passwordStrength, resendConfirmation, requestPasswordReset
  };
})();
