import 'server-only';
import { getSession } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { consumeRequest } from '@/lib/limits/consume';
import { GitHubError } from '@/lib/github/security';
import { McpClientError } from '@/lib/mcp/client';
import { boundedText } from '@/lib/integrations/server';
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export async function githubSession(request: Request, mutation = false, limit = false) {
  if (mutation && !isSameOrigin(request)) throw new GitHubError(403, 'ORIGIN_DENIED', 'Reload this page before trying again.');
  const session = await getSession();
  const { data: { user }, error } = await session.supabase.auth.getUser();
  if (error || !user || user.is_anonymous || user.id !== session.user?.id) throw new GitHubError(401, 'SIGN_IN_REQUIRED', 'Sign in to your Unbound account first.');
  if (limit) {
    const budget = await consumeRequest(session.supabase, 'chat');
    if (!budget.allowed) throw new GitHubError(429, 'RATE_LIMITED', budget.message, budget.retryAfterSeconds);
    if (budget.degraded) throw new GitHubError(503, 'LIMITS_UNAVAILABLE', 'Usage checks are unavailable. Try again later.');
  }
  return { db: session.supabase, userId: user.id };
}
export function githubErrorResponse(error: unknown) {
  const safe = error instanceof GitHubError ? error : error instanceof McpClientError
    ? new GitHubError(error.code === 'RATE_LIMITED' ? 429 : error.code === 'AUTHENTICATION_REQUIRED' ? 401 : 502, error.code, error.message, error.retryAfterSeconds)
    : new GitHubError(502, 'UNAVAILABLE', 'The GitHub request could not finish. Please try again.');
  return Response.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: { ...privateHeaders, ...(safe.retryAfter ? { 'Retry-After': String(safe.retryAfter) } : {}) } });
}
export async function githubBody(request: Request) {
  try { return JSON.parse(await boundedText(new Response(request.body), 4096)); }
  catch { throw new GitHubError(400, 'INVALID_INPUT', 'The request is invalid or too large.'); }
}
