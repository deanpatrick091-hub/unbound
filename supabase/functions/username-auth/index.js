import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { normalizeUsername, validPassword } from './validation.js';

const url = Deno.env.get('SUPABASE_URL');
const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const publicKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secret, options);
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const error = (status, message) => reply(status, { error: message });
async function throttle(bucket, limit, seconds) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bucket));
  const key = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  const result = await admin.rpc('consume_auth_attempt', { p_key: key, p_limit: limit, p_seconds: seconds });
  if (result.error) throw new Error('Auth limiter unavailable');
  return result.data === true;
}

// verify_jwt=false is required for modern signing keys. Every request is
// independently authenticated against Supabase Auth below, before admin work.
Deno.serve(async request => {
  if (request.method !== 'POST') return error(405, 'Use POST.');
  try {
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return error(401, 'Start a session before continuing.');
    const verified = await admin.auth.getUser(token);
    const actor = verified.data.user;
    if (verified.error || !actor) return error(401, 'Your session expired. Reload and retry.');
    if (!await throttle('actor:'+actor.id, 30, 900)) return error(429, 'Too many attempts. Please wait 15 minutes.');
    const raw = await request.text();
    if (raw.length > 6000) return error(400, 'The account request is too large.');
    let body; try { body = JSON.parse(raw); } catch { return error(400, 'Enter your account details.'); }
    if (!body || typeof body !== 'object') return error(400, 'Enter your account details.');
    const action = body.action;
    if (!['signup','login','claim'].includes(action)) return error(400, 'Choose a valid account action.');
    const username = normalizeUsername(body.username);
    const legacyEmail = action === 'login' && typeof body.username === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.username.trim()) ? body.username.trim().toLowerCase() : null;
    if (!username && !legacyEmail) return error(400, 'Use 3–30 letters, numbers or underscores, starting with a letter. Reserved names are unavailable.');
    if (action !== 'claim' && (typeof body.password !== 'string' || body.password.length > 128 || (action === 'signup' ? !validPassword(body.password) : !body.password))) return error(400, 'Use a password of 10–128 characters.');
    if (!await throttle('identity:'+(username || legacyEmail), 10, 900)) return error(429, 'Too many attempts for this account. Please wait 15 minutes.');

    if (action === 'login') {
      let email = legacyEmail;
      if (!email) {
        const handle = await admin.from('user_handles').select('user_id').eq('username', username).maybeSingle();
        if (handle.error) throw new Error('Identity lookup unavailable');
        if (handle.data) {
          const identity = await admin.auth.admin.getUserById(handle.data.user_id);
          if (identity.error) throw new Error('Identity lookup unavailable');
          if (!identity.data.user.is_anonymous) email = identity.data.user.email;
        }
      }
      // Unknown usernames take the same password-authentication path. Never
      // return another user's email, profile, or whether the account exists.
      const auth = createClient(url, publicKey, options);
      const signed = await auth.auth.signInWithPassword({ email: email || 'missing-account@accounts.unbound.invalid', password: body.password });
      if (signed.error || !signed.data.session) return error(401, 'Username or password is incorrect.');
      return reply(200, { access_token: signed.data.session.access_token, refresh_token: signed.data.session.refresh_token });
    }

    if (action === 'signup' && !actor.is_anonymous) return error(409, 'This account already exists. Sign in or choose a username for it.');
    if (action === 'claim' && actor.is_anonymous) return error(400, 'Create your account with a password first.');
    const own = await admin.from('user_handles').select('username').eq('user_id', actor.id).maybeSingle();
    if (own.error) throw new Error('Identity lookup unavailable');
    if (own.data && own.data.username !== username) return error(409, 'Use your saved username to secure this workspace. You can rename it in Settings later.');
    if (!own.data) {
      const inserted = await admin.from('user_handles').insert({ user_id: actor.id, username, display_name: username });
      if (inserted.error) return error(inserted.error.code === '23505' ? 409 : 400, 'That username is unavailable. Choose another.');
    }
    if (action === 'claim') return reply(200, { ok: true });
    // Upgrade the guest in place. Never replace its ID, delete it, or move data.
    // The random identity is not derived from the username and isn't an inbox.
    const email = crypto.randomUUID()+'@accounts.unbound.invalid';
    const upgraded = await admin.auth.admin.updateUserById(actor.id, { email, password: body.password, email_confirm: true });
    if (upgraded.error) return error(503, 'Your workspace is safe, but account setup failed. Retry with the same username.');
    const auth = createClient(url, publicKey, options);
    const signed = await auth.auth.signInWithPassword({ email, password: body.password });
    if (signed.error || !signed.data.session) return error(503, 'Account created. Switch to Sign in and use your username and password.');
    return reply(200, { access_token: signed.data.session.access_token, refresh_token: signed.data.session.refresh_token });
  } catch {
    console.error('[username-auth] request failed');
    return error(503, 'Account service is temporarily unavailable. Please retry.');
  }
});
