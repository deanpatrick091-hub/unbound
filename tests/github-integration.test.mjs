import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { encrypt, decrypt, context, challenge, githubConfiguration, githubConfigurationChecks } from '../lib/github/security.ts';
import { GITHUB_MCP, discoverGitHubOAuth, githubTool, tokenRequest, verifyGitHubAccount, revokeGitHubToken } from '../lib/github/provider.ts';

function config(t) {
  const values = { GITHUB_OAUTH_CLIENT_ID: 'Iv1.fixture', GITHUB_OAUTH_CLIENT_SECRET: 'fixture-secret-not-a-real-key', GITHUB_OAUTH_REDIRECT_URI: 'https://unbound.example/api/integrations/github/callback', GITHUB_APP_SLUG: 'unbound-fixture', INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
  for (const [name, value] of Object.entries(values)) { const old = process.env[name]; process.env[name] = value; t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; }); }
}
test('GitHub encrypted credentials bind to user, app and connection; tampering fails', t => {
  config(t); const schema = z.object({ token: z.string() });
  const sealed = encrypt({ token: 'fixture-only' }, context('user-a', 'connection-a'));
  assert.ok(!sealed.includes('fixture-only'));
  assert.deepEqual(decrypt(sealed, context('user-a', 'connection-a'), schema), { token: 'fixture-only' });
  for (const ctx of [context('user-b', 'connection-a'), context('user-a', 'connection-b')]) assert.throws(() => decrypt(sealed, ctx, schema), /Reconnect/);
  const parts = sealed.split('.'); parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  assert.throws(() => decrypt(parts.join('.'), context('user-a', 'connection-a'), schema), /Reconnect/);
});
test('GitHub configuration rejects unsafe callback and wrong app type without echoing secrets', t => {
  config(t); assert.equal(githubConfiguration().origin, 'https://unbound.example');
  process.env.GITHUB_OAUTH_REDIRECT_URI = 'https://unbound.example/api/integrations/github/callback?secret=hidden';
  assert.throws(githubConfiguration, e => !e.message.includes('hidden') && e.code === 'SETUP_REQUIRED');
  process.env.GITHUB_OAUTH_REDIRECT_URI = 'https://unbound.example/api/integrations/github/callback';
  process.env.GITHUB_OAUTH_CLIENT_ID = 'traditional-oauth-id'; assert.throws(githubConfiguration, /GitHub App/);
});
test('PKCE challenge matches the RFC 7636 test vector', () => {
  assert.equal(challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('GitHub operation adapters expose only reviewed read methods and bounded input', () => {
  assert.equal(githubTool({ action: 'repositories' }, 'dean').args.query, 'user:dean');
  assert.equal(githubTool({ action: 'file', owner: 'owner', repo: 'repo', path: 'src/app.ts' }, 'dean').name, 'get_file_contents');
  assert.deepEqual(githubTool({ action: 'issue', owner: 'owner', repo: 'repo', number: 1 }, 'dean').args, { owner: 'owner', repo: 'repo', method: 'get', issue_number: 1 });
  for (const value of [{ action: 'delete_repository' }, { action: 'repositories', tool: 'create_issue' }, { action: 'file', owner: 'a', repo: 'b', path: '../secret' }, { action: 'issue', owner: 'a', repo: 'b', number: -1 }]) assert.throws(() => githubTool(value, 'dean'), /valid/);
  assert.equal(GITHUB_MCP.endpoint, 'https://api.githubcopilot.com/mcp/readonly');
});
test('OAuth discovery pins the protected resource, issuer and endpoints', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(String(url)); assert.equal(init.redirect, 'error');
    if (String(url) === GITHUB_MCP.endpoint) return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/readonly"' } });
    if (String(url).includes('oauth-protected-resource')) return Response.json({ resource: GITHUB_MCP.endpoint, authorization_servers: ['https://github.com/login/oauth'] });
    return Response.json({ issuer: 'https://github.com/login/oauth', authorization_endpoint: 'https://github.com/login/oauth/authorize', token_endpoint: 'https://github.com/login/oauth/access_token', code_challenge_methods_supported: ['S256'] });
  });
  assert.equal((await discoverGitHubOAuth()).tokenEndpoint, 'https://github.com/login/oauth/access_token'); assert.equal(calls.length, 3);
});
test('OAuth discovery refuses malicious redirect metadata before fetching it', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://evil.example/steal"' } }); });
  await assert.rejects(discoverGitHubOAuth(), /discovery/); assert.equal(calls, 1);
});
test('GitHub token exchange uses server POST body, PKCE and expiring GitHub App tokens', async t => {
  config(t);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://github.com/login/oauth/access_token'); assert.equal(init.method, 'POST');
    assert.equal(init.body.get('code_verifier'), 'fixture-verifier'); assert.equal(init.body.get('client_secret'), 'fixture-secret-not-a-real-key');
    return Response.json({ access_token: 'ghu_fixture', refresh_token: 'ghr_fixture', token_type: 'bearer', expires_in: 28800, refresh_token_expires_in: 15897600, scope: '' });
  });
  const tokens = await tokenRequest({ code: 'fixture', code_verifier: 'fixture-verifier' }); assert.ok(tokens.expiresAt > Date.now());
});
test('GitHub account verification rejects write permissions', async t => {
  t.mock.method(globalThis, 'fetch', async url => String(url).endsWith('/user') ? Response.json({ id: 1, login: 'fixture' }) : Response.json({ installations: [{ permissions: { metadata: 'read', contents: 'write', issues: 'read' } }] }));
  await assert.rejects(verifyGitHubAccount('ghu_fixture'), e => e.code === 'PERMISSIONS_TOO_BROAD');
});
test('GitHub account verification requires installation and accepts only narrow read permissions', async t => {
  let installed = false;
  t.mock.method(globalThis, 'fetch', async url => String(url).endsWith('/user') ? Response.json({ id: 1, login: 'fixture' }) : Response.json({ installations: installed ? [{ permissions: { metadata: 'read', contents: 'read', issues: 'read' } }] : [] }));
  await assert.rejects(verifyGitHubAccount('ghu_fixture'), e => e.code === 'INSTALL_REQUIRED');
  installed = true; assert.deepEqual(await verifyGitHubAccount('ghu_fixture'), { githubId: 1, login: 'fixture' });
});
test('Disconnect attempts token revocation without putting secrets in the URL', async t => {
  config(t);
  t.mock.method(globalThis, 'fetch', async (url, init) => { assert.equal(String(url), 'https://api.github.com/applications/Iv1.fixture/token'); assert.equal(init.method, 'DELETE'); assert.equal(JSON.parse(init.body).access_token, 'ghu_fixture'); return new Response(null, { status: 204 }); });
  assert.equal(await revokeGitHubToken('ghu_fixture'), true);
});
test('GitHub rate limit and invalid-token responses are safe and never retried', async t => {
  config(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('sensitive provider text', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '120' } }); });
  await assert.rejects(tokenRequest({ code: 'fixture' }), e => e.code === 'RATE_LIMITED' && e.retryAfter === 120 && !e.message.includes('sensitive')); assert.equal(calls, 1);
});

test('configuration diagnostics identify each failing field without leaking supplied values', t => {
  config(t);
  assert.ok(githubConfigurationChecks().every(check => check.state === 'VALID'));
  for (const { name } of githubConfigurationChecks()) {
    const original = process.env[name];
    for (const value of ['', ' invalid-sensitive-fixture ! ']) {
      process.env[name] = value;
      const failures = githubConfigurationChecks().filter(check => check.state !== 'VALID');
      assert.deepEqual(failures, [{ name, state: value ? 'INVALID' : 'MISSING' }]);
      assert.throws(githubConfiguration, error => error.message.includes(name) && !error.message.includes('sensitive-fixture'));
    }
    process.env[name] = original;
  }
});
