import { githubSession, githubErrorResponse, privateHeaders } from '@/lib/github/http';
import { context, credentialSchema, decrypt, githubConfiguration } from '@/lib/github/security';
import { connection } from '@/lib/github/store';
import type { GitHubStatus } from '@/lib/github/types';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const { db, userId } = await githubSession(request);
    let config;
    try { config = githubConfiguration(); } catch { return Response.json({ state: 'SETUP_REQUIRED', message: 'The site owner needs to configure the GitHub App credentials and encryption key.' } satisfies GitHubStatus, { headers: privateHeaders }); }
    const installUrl = `https://github.com/apps/${config.slug}/installations/new`;
    const row = await connection(db, userId);
    if (!row) return Response.json({ state: 'DISCONNECTED', installUrl } satisfies GitHubStatus, { headers: privateHeaders });
    try {
      const credential = decrypt(row.credential_ciphertext, context(userId, row.connection_id), credentialSchema);
      return Response.json({ state: credential.refreshExpiresAt > Date.now() ? 'CONNECTED' : 'RECONNECT_REQUIRED', login: credential.login, verifiedAt: row.verified_at, installUrl } satisfies GitHubStatus, { headers: privateHeaders });
    } catch { return Response.json({ state: 'RECONNECT_REQUIRED', installUrl } satisfies GitHubStatus, { headers: privateHeaders }); }
  } catch (error) { return githubErrorResponse(error); }
}
