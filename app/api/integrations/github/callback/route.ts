import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { githubSession, githubErrorResponse, privateHeaders } from '@/lib/github/http';
import { context, credentialSchema, decrypt, digest, encrypt, GitHubError, githubConfiguration, OAUTH_COOKIE, stateSchema } from '@/lib/github/security';
import { revokeGitHubToken, tokenRequest, verifyGitHubAccount, verifyMcp } from '@/lib/github/provider';
import { connection, storageError } from '@/lib/github/store';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request: Request) {
  let origin: string;
  try { origin = githubConfiguration().origin; } catch (error) { return githubErrorResponse(error); }
  const cookieStore = await cookies();
  let newToken: string | undefined;
  let result = 'failed';
  try {
    const { db, userId } = await githubSession(request);
    const query = new URL(request.url).searchParams;
    const state = query.get('state'), code = query.get('code'), browser = cookieStore.get(OAUTH_COOKIE)?.value;
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browser || !/^[A-Za-z0-9_-]{43}$/.test(browser)) throw new GitHubError(400, 'INVALID_STATE', 'Start a new GitHub connection.');
    if (query.get('iss') && query.get('iss') !== 'https://github.com/login/oauth') throw new GitHubError(400, 'INVALID_STATE', 'The GitHub authorization issuer did not match.');
    const stateHash = digest(state);
    const pending = await db.from('github_oauth_states').select('*').eq('user_id', userId).eq('state_hash', stateHash).maybeSingle();
    if (pending.error) throw storageError();
    if (!pending.data || pending.data.claimed) throw new GitHubError(400, 'INVALID_STATE', 'Start a new GitHub connection.');
    const attempt = decrypt(pending.data.state_ciphertext, context(userId, `state:${stateHash}`), stateSchema);
    if (attempt.browserHash !== digest(browser) || attempt.expiresAt <= Date.now()) throw new GitHubError(400, 'INVALID_STATE', 'Start a new GitHub connection.');
    const claimed = await db.from('github_oauth_states').update({ claimed: true }).eq('user_id', userId).eq('state_hash', stateHash).eq('claimed', false).gt('expires_at', new Date().toISOString()).select('user_id').maybeSingle();
    if (claimed.error) throw storageError();
    if (!claimed.data) throw new GitHubError(400, 'INVALID_STATE', 'This GitHub authorization was already used.');
    if (query.has('error')) { result = 'denied'; }
    else {
      if (!code || !/^[a-zA-Z0-9_-]{1,256}$/.test(code)) throw new GitHubError(400, 'INVALID_CODE', 'GitHub did not return a valid authorization code.');
      const previous = await connection(db, userId);
      const tokens = await tokenRequest({ code, code_verifier: attempt.verifier, redirect_uri: githubConfiguration().redirectUri }, request.signal);
      newToken = tokens.accessToken;
      const account = await verifyGitHubAccount(tokens.accessToken, request.signal);
      await verifyMcp(tokens.accessToken, request.signal);
      const id = randomUUID();
      const saved = await db.rpc('complete_github_oauth', { p_state_hash: stateHash, p_connection_id: id, p_ciphertext: encrypt({ ...tokens, ...account }, context(userId, id)) });
      if (saved.error) throw storageError();
      newToken = undefined;
      if (previous) {
        try { const old = decrypt(previous.credential_ciphertext, context(userId, previous.connection_id), credentialSchema); if (old.accessToken !== tokens.accessToken) await revokeGitHubToken(old.accessToken); } catch { /* Replaced ciphertext may use a retired encryption key. */ }
      }
      result = 'connected';
    }
    await db.from('github_oauth_states').delete().eq('user_id', userId).eq('state_hash', stateHash);
  } catch (error) {
    result = error instanceof GitHubError && error.code === 'INSTALL_REQUIRED' ? 'install-required' : error instanceof GitHubError && error.code === 'PERMISSIONS_TOO_BROAD' ? 'permissions' : 'failed';
  } finally {
    if (newToken) await revokeGitHubToken(newToken);
    cookieStore.set(OAUTH_COOKIE, '', { httpOnly: true, secure: githubConfiguration().secure, sameSite: 'lax', path: '/api/integrations/github/callback', maxAge: 0 });
  }
  const response = NextResponse.redirect(new URL(`/tools?github=${result}`, origin), 303);
  Object.entries(privateHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}
