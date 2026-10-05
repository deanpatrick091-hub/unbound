import { createClient } from '@/lib/supabase/server';
import { getSupabaseEnv } from '@/lib/supabase/env';
export const maxDuration = 60;
export async function POST(request: Request) {
  const respond = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (process.env.USERNAME_AUTH_ENABLED !== 'true') return respond(503, 'Username sign-in is not enabled yet.');
  if (request.headers.get('origin') !== new URL(request.url).origin) return respond(403, 'Reload this page before continuing.');
  try {
    const raw = await request.text();
    if (raw.length > 6000) return respond(400, 'The account request is too large.');
    let body; try { body = JSON.parse(raw); } catch { return respond(400, 'Enter your account details.'); }
    const supabase = await createClient();
    const { data: verified, error: authError } = await supabase.auth.getUser();
    if (authError || !verified.user) return respond(401, 'Your session expired. Reload this page.');
    if (body?.action === 'logout') {
      const { error } = await supabase.auth.signOut();
      return error ? respond(503, 'Could not sign out. Retry.') : Response.json({ ok: true });
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) return respond(401, 'Your session expired. Reload this page.');
    const { url, publishableKey } = getSupabaseEnv();
    const upstream = await fetch(url+'/functions/v1/username-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publishableKey, Authorization: 'Bearer '+data.session.access_token },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000), cache: 'no-store',
    });
    const result = await upstream.json();
    if (!upstream.ok) return respond(upstream.status, typeof result.error === 'string' ? result.error : 'Account service is temporarily unavailable.');
    if (result.access_token && result.refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
      if (error) return respond(503, 'Account verified, but the session could not be saved. Please sign in again.');
    } else if (result.ok !== true) return respond(503, 'Account service returned an incomplete response.');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return respond(503, 'Account service is temporarily unavailable. Please retry.'); }
}
