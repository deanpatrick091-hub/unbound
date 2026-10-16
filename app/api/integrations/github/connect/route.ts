import { cookies } from 'next/headers';
import { githubSession, githubErrorResponse, privateHeaders } from '@/lib/github/http';
import { challenge, context, digest, encrypt, GitHubError, githubConfiguration, OAUTH_COOKIE, randomSecret } from '@/lib/github/security';
import { discoverGitHubOAuth } from '@/lib/github/provider';
import { storageError } from '@/lib/github/store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { db, userId } = await githubSession(request, true, true);
    const config = githubConfiguration();
    if (request.headers.get('origin') !== config.origin) throw new GitHubError(409, 'CALLBACK_MISMATCH', 'Open the Unbound address configured for this GitHub App before connecting.');
    const endpoints = await discoverGitHubOAuth(request.signal);
    const state = randomSecret(), browser = randomSecret(), verifier = randomSecret();
    const stateHash = digest(state), expiresAt = Date.now() + 600000;
    const { error } = await db.from('github_oauth_states').upsert({ user_id: userId, state_hash: stateHash, claimed: false, expires_at: new Date(expiresAt).toISOString(), state_ciphertext: encrypt({ verifier, browserHash: digest(browser), expiresAt }, context(userId, `state:${stateHash}`)) });
    if (error) throw storageError();
    (await cookies()).set(OAUTH_COOKIE, browser, { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/api/integrations/github/callback', maxAge: 600 });
    const url = new URL(endpoints.authorizationEndpoint);
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, state, code_challenge: challenge(verifier), code_challenge_method: 'S256', scope: 'offline_access' }).toString();
    return Response.json({ url: url.href }, { headers: privateHeaders });
  } catch (error) { return githubErrorResponse(error); }
}
