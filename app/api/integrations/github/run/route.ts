import { githubBody, githubSession, githubErrorResponse, privateHeaders } from '@/lib/github/http';
import { credentials, currentConnection } from '@/lib/github/store';
import { githubTool, runGitHubRead } from '@/lib/github/provider';
import { GitHubError } from '@/lib/github/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { db, userId } = await githubSession(request, true, true);
    const input = await githubBody(request);
    githubTool(input, 'validation');
    const { row, value } = await credentials(db, userId, request.signal);
    const authorized = () => currentConnection(db, userId, row.connection_id);
    const result = await runGitHubRead(value, input, authorized, request.signal);
    if (!await authorized()) throw new GitHubError(409, 'DISCONNECTED', 'The GitHub connection changed during this request.');
    return Response.json(result, { headers: privateHeaders });
  } catch (error) { return githubErrorResponse(error); }
}
