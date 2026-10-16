import { githubSession, githubErrorResponse, privateHeaders } from '@/lib/github/http';
import { context, credentialSchema, decrypt } from '@/lib/github/security';
import { revokeGitHubToken } from '@/lib/github/provider';
import { storageError } from '@/lib/github/store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { db, userId } = await githubSession(request, true);
    // Clear pending callbacks first. Finalization and disconnect lock in this order.
    const pending = await db.from('github_oauth_states').delete().eq('user_id', userId);
    if (pending.error) throw storageError();
    const removed = await db.from('github_connections').delete().eq('user_id', userId).select('*').maybeSingle();
    if (removed.error) throw storageError();
    let revoked = !removed.data;
    if (removed.data) {
      try { const value = decrypt(removed.data.credential_ciphertext, context(userId, removed.data.connection_id), credentialSchema); revoked = await revokeGitHubToken(value.accessToken); } catch { revoked = false; }
    }
    return Response.json({ disconnected: true, revoked, message: revoked ? 'GitHub disconnected.' : 'Disconnected from Unbound. GitHub revocation could not be confirmed; revoke the app under GitHub Settings → Applications → Authorized GitHub Apps.' }, { headers: privateHeaders });
  } catch (error) { return githubErrorResponse(error); }
}
