import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export class GitHubError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}
const required = ['GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'GITHUB_OAUTH_REDIRECT_URI', 'GITHUB_APP_SLUG', 'INTEGRATION_ENCRYPTION_KEY'] as const;
export function githubConfiguration() {
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new GitHubError(503, 'SETUP_REQUIRED', 'GitHub connection setup is required.');
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID!.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET!.trim();
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI!.trim();
  const slug = process.env.GITHUB_APP_SLUG!.trim();
  const keyText = process.env.INTEGRATION_ENCRYPTION_KEY!.trim();
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new GitHubError(503, 'SETUP_REQUIRED', 'GitHub callback configuration is invalid.'); }
  const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!/^Iv[0-9A-Za-z.]+$/.test(clientId) || !/^[\x21-\x7e]{16,256}$/.test(clientSecret) ||
      !/^[a-z0-9-]{1,100}$/.test(slug) || !/^[A-Za-z0-9+/]{43}=$/.test(keyText) ||
      Buffer.from(keyText, 'base64').length !== 32 || (!local && url.protocol !== 'https:') ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/api/integrations/github/callback') {
    throw new GitHubError(503, 'SETUP_REQUIRED', 'GitHub server configuration is invalid. Use a GitHub App client ID and a 32-byte encryption key.');
  }
  return { clientId, clientSecret, redirectUri, origin: url.origin, slug, key: Buffer.from(keyText, 'base64'), secure: url.protocol === 'https:' };
}
export const randomSecret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const challenge = (value: string) => createHash('sha256').update(value).digest('base64url');
export function encrypt(value: unknown, context: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', githubConfiguration().key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decrypt<T>(value: string, context: string, schema: z.ZodType<T>): T {
  try {
    const [version, iv, tag, data, extra] = value.split('.');
    if (version !== 'v1' || extra || !data || value.length > 24000) throw Error();
    const decipher = createDecipheriv('aes-256-gcm', githubConfiguration().key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return schema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')));
  } catch { throw new GitHubError(409, 'RECONNECT_REQUIRED', 'Reconnect GitHub to restore access.'); }
}
export const credentialSchema = z.object({
  accessToken: z.string().regex(/^ghu_[A-Za-z0-9_]+$/).max(8192),
  refreshToken: z.string().regex(/^ghr_[A-Za-z0-9_]+$/).max(8192),
  expiresAt: z.number(), refreshExpiresAt: z.number(), login: z.string().regex(/^[a-zA-Z0-9-]+$/), githubId: z.number().int().positive(),
});
export type Credentials = z.infer<typeof credentialSchema>;
export const stateSchema = z.object({ verifier: z.string(), browserHash: z.string(), expiresAt: z.number() });
export function context(userId: string, id: string) { return `${userId}:github:${githubConfiguration().clientId}:${id}`; }
export const OAUTH_COOKIE = 'unbound-github-oauth';
