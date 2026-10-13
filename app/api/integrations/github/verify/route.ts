import { githubSession, githubErrorResponse, privateHeaders } from '@/lib/github/http';
import { credentials } from '@/lib/github/store';
import { verifyGitHubAccount, verifyMcp } from '@/lib/github/provider';
import { GitHubError } from '@/lib/github/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { db, userId } = await githubSession(request, true, true);
    const { row, value } = await credentials(db, userId, request.signal);
    const account = await verifyGitHubAccount(value.accessToken, request.signal);
    if (account.githubId !== value.githubId) throw new GitHubError(409, 'RECONNECT_REQUIRED', 'The GitHub account changed. Connect again.');
    await verifyMcp(value.accessToken, request.signal);
    const verifiedAt = new Date().toISOString();
    const saved = await db.from('github_connections').update({ verified_at: verifiedAt }).eq('user_id', userId).eq('connection_id', row.connection_id).select('user_id').maybeSingle();
    if (saved.error || !saved.data) throw new GitHubError(409, 'DISCONNECTED', 'The GitHub connection changed during verification.');
    return Response.json({ verified: true, verifiedAt }, { headers: privateHeaders });
  } catch (error) { return githubErrorResponse(error); }
}
