import 'server-only';
import { z } from 'zod';
import { withMcpClient } from '@/lib/mcp/client';
import { boundedText } from '@/lib/integrations/server';
import { GitHubError, githubConfiguration, type Credentials } from '@/lib/github/security';

export const GITHUB_MCP = { id: 'github', endpoint: 'https://api.githubcopilot.com/mcp/readonly', readTools: ['search_repositories', 'get_file_contents', 'list_issues', 'issue_read'] };
const AUTH_ISSUER = 'https://github.com/login/oauth';
export async function githubFetch(url: string, init: RequestInit = {}, signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) }); }
  catch { throw new GitHubError(502, 'UNAVAILABLE', 'GitHub could not be reached. Please retry.'); }
  if (!response.ok) {
    const limited = response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
    const raw = response.headers.get('retry-after');
    const retry = raw && /^\d+$/.test(raw) ? Math.min(Number(raw), 86400) : 60;
    await response.body?.cancel();
    throw new GitHubError(limited ? 429 : response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
      limited ? 'RATE_LIMITED' : response.status === 401 ? 'RECONNECT_REQUIRED' : 'UNAVAILABLE',
      limited ? 'GitHub is rate limited. Wait before retrying.' : response.status === 401 ? 'Reconnect GitHub to restore access.' : 'GitHub could not complete this request. Check app installation and organization approval.', limited ? retry : undefined);
  }
  return response;
}
async function json(response: Response) { return JSON.parse(await boundedText(response, 1_000_000)); }
/** Discover the issuer advertised by the actual MCP endpoint, then pin every origin/endpoint. */
export async function discoverGitHubOAuth(signal?: AbortSignal) {
  const response = await fetch(GITHUB_MCP.endpoint, { redirect: 'error', cache: 'no-store', signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
  const metadata = response.headers.get('www-authenticate')?.match(/resource_metadata="([^"]+)"/)?.[1];
  await response.body?.cancel();
  if (response.status !== 401 || metadata !== 'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/readonly') throw new GitHubError(502, 'DISCOVERY_FAILED', 'GitHub authentication discovery could not be verified.');
  const resource = await json(await githubFetch(metadata, {}, signal));
  if (resource.resource !== GITHUB_MCP.endpoint || !resource.authorization_servers?.includes(AUTH_ISSUER)) throw new GitHubError(502, 'DISCOVERY_FAILED', 'GitHub authentication discovery could not be verified.');
  const server = await json(await githubFetch('https://github.com/.well-known/oauth-authorization-server/login/oauth', {}, signal));
  if (server.issuer !== AUTH_ISSUER || server.authorization_endpoint !== `${AUTH_ISSUER}/authorize` || server.token_endpoint !== `${AUTH_ISSUER}/access_token` || !server.code_challenge_methods_supported?.includes('S256')) throw new GitHubError(502, 'DISCOVERY_FAILED', 'GitHub authentication discovery could not be verified.');
  return { authorizationEndpoint: server.authorization_endpoint as string, tokenEndpoint: server.token_endpoint as string };
}
export async function tokenRequest(fields: Record<string, string>, signal?: AbortSignal) {
  const config = githubConfiguration();
  const result = await json(await githubFetch(`${AUTH_ISSUER}/access_token`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
  }, signal));
  const parsed = z.object({ access_token: z.string().regex(/^ghu_[A-Za-z0-9_]+$/).max(8192), refresh_token: z.string().regex(/^ghr_[A-Za-z0-9_]+$/).max(8192), expires_in: z.number().int().positive(), refresh_token_expires_in: z.number().int().positive(), token_type: z.literal('bearer'), scope: z.literal('').optional() }).safeParse(result);
  if (!parsed.success) throw new GitHubError(409, 'RECONNECT_REQUIRED', 'GitHub authorization expired or the app is not configured for expiring user tokens. Reconnect GitHub.');
  return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token, expiresAt: Date.now() + parsed.data.expires_in * 1000, refreshExpiresAt: Date.now() + parsed.data.refresh_token_expires_in * 1000 };
}
function headers(token: string) { return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
export async function verifyGitHubAccount(token: string, signal?: AbortSignal) {
  const account = z.object({ id: z.number().int().positive(), login: z.string().regex(/^[a-zA-Z0-9-]+$/) }).parse(await json(await githubFetch('https://api.github.com/user', { headers: headers(token) }, signal)));
  const installations = await json(await githubFetch('https://api.github.com/user/installations?per_page=100', { headers: headers(token) }, signal));
  if (!Array.isArray(installations.installations) || installations.installations.length === 0) throw new GitHubError(409, 'INSTALL_REQUIRED', 'Install the GitHub App on selected repositories, then connect again.');
  for (const installation of installations.installations) {
    const permissions = installation.permissions;
    if (!permissions || permissions.contents !== 'read' || permissions.issues !== 'read' || Object.entries(permissions).some(([name, value]) => !['contents', 'issues', 'metadata'].includes(name) || value !== 'read')) throw new GitHubError(403, 'PERMISSIONS_TOO_BROAD', 'Configure the GitHub App with only read-only Contents, Issues and Metadata permissions.');
  }
  return { login: account.login, githubId: account.id };
}
export async function verifyMcp(token: string, signal?: AbortSignal) {
  const tools = await withMcpClient(GITHUB_MCP, { bearerToken: token, signal, authorize: () => false }, mcp => mcp.listTools());
  if (!GITHUB_MCP.readTools.every(name => tools.some(tool => tool.name === name))) throw new GitHubError(502, 'TOOLS_UNAVAILABLE', 'GitHub did not expose the required read-only tools.');
}
export async function revokeGitHubToken(token: string) {
  const config = githubConfiguration();
  try {
    await githubFetch(`https://api.github.com/applications/${config.clientId}/token`, { method: 'DELETE', headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' }, body: JSON.stringify({ access_token: token }) });
    return true;
  } catch { return false; }
}
const owner = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/);
const repo = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/).refine(s => s !== '.' && s !== '..');
export const operationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('repositories'), query: z.string().max(200).regex(/^[\p{L}\p{N}\s:._\/-]*$/u).default(''), page: z.number().int().min(1).max(10).default(1) }).strict(),
  z.object({ action: z.literal('file'), owner, repo, path: z.string().max(500).refine(p => !p.startsWith('/') && !p.split('/').includes('..') && !/[\\\x00-\x1f]/.test(p)), ref: z.string().max(200).regex(/^[a-zA-Z0-9_./-]*$/).default('') }).strict(),
  z.object({ action: z.literal('issues'), owner, repo }).strict(),
  z.object({ action: z.literal('issue'), owner, repo, number: z.number().int().positive().max(2147483647) }).strict(),
]);
export function githubTool(input: unknown, login: string): {name: string; args: Record<string, string | number | boolean>} {
  const parsed = operationSchema.safeParse(input);
  if (!parsed.success) throw new GitHubError(400, 'INVALID_INPUT', 'Enter a valid repository, file path or issue number.');
  const v = parsed.data;
  if (v.action === 'repositories') return { name: 'search_repositories', args: { query: v.query.trim() || `user:${login}`, page: v.page, perPage: 20, minimal_output: true } };
  if (v.action === 'file') return { name: 'get_file_contents', args: { owner: v.owner, repo: v.repo, path: v.path, ...(v.ref ? { ref: v.ref } : {}) } };
  if (v.action === 'issues') return { name: 'list_issues', args: { owner: v.owner, repo: v.repo, perPage: 20 } };
  return { name: 'issue_read', args: { owner: v.owner, repo: v.repo, method: 'get', issue_number: v.number } };
}
export async function runGitHubRead(credentials: Credentials, input: unknown, authorize: () => Promise<boolean>, signal?: AbortSignal) {
  const tool = githubTool(input, credentials.login);
  return withMcpClient(GITHUB_MCP, { bearerToken: credentials.accessToken, signal, authorize: async name => name === tool.name && await authorize() }, mcp => mcp.callTool(tool.name, tool.args));
}
