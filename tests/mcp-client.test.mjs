import test from 'node:test';
import assert from 'node:assert/strict';
import { withMcpClient, McpClientError } from '../lib/mcp/client.ts';

const server = { id: 'fixture', endpoint: 'https://mcp.example.org/mcp', readTools: ['lookup'] };
const access = { authorize: async () => true };
const tool = { name: 'lookup', description: 'Fixture lookup', inputSchema: { type: 'object' } };

// The real installed SDK and HTTP transport run against a deterministic protocol
// fixture. These are NOT claims of a live third-party account connection.
function fixture(t, overrides = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), ...init });
    if (overrides.fetch) return overrides.fetch(url, init);
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    const message = JSON.parse(init.body);
    if (message.id === undefined) return new Response(null, { status: 202 });
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } };
    else if (message.method === 'tools/list') result = overrides.list ? overrides.list(message.params) : { tools: [tool, { ...tool, name: 'delete_everything' }] };
    else if (message.method === 'tools/call') result = overrides.call ?? { content: [{ type: 'text', text: 'fixture result' }] };
    else throw new Error('Unexpected method: ' + message.method);
    return Response.json({ jsonrpc: '2.0', id: message.id, result }, { headers: { 'mcp-session-id': 'fixture-session' } });
  });
  return calls;
}
const hasCode = (code) => (error) => error instanceof McpClientError && error.code === code;

test('MCP performs handshake, filters tools, calls an authorized tool and closes its session', async (t) => {
  const calls = fixture(t);
  const grants = [];
  const value = await withMcpClient(server, { bearerToken: 'fixture-token', authorize: async (...args) => { grants.push(args); return true; } }, async (mcp) => {
    assert.deepEqual((await mcp.listTools()).map(t => t.name), ['lookup']);
    return mcp.callTool('lookup', { query: 'hello' });
  });
  assert.equal(value.trust, 'untrusted_external_data');
  assert.equal(value.result.content[0].text, 'fixture result');
  assert.deepEqual(grants, [['lookup', { query: 'hello' }]]);
  assert.equal(calls.at(-1).method, 'DELETE');
  for (const call of calls) {
    assert.equal(call.redirect, 'error');
    assert.equal(call.cache, 'no-store');
    assert.equal(call.credentials, 'omit');
    assert.equal(call.headers.get('authorization'), 'Bearer fixture-token');
    assert.equal(call.url, server.endpoint);
  }
});

test('MCP rejects unsafe configuration before any network traffic', async (t) => {
  const calls = fixture(t);
  for (const endpoint of ['http://mcp.example.org', 'https://127.0.0.1/mcp', 'https://[::1]/mcp', 'https://localhost/mcp', 'https://host.local/mcp', 'https://key:secret@example.org/mcp', 'https://example.org/mcp?token=secret', 'https://example.org:8443/mcp']) {
    await assert.rejects(withMcpClient({ ...server, endpoint }, access, async () => {}), hasCode('CONFIGURATION_REQUIRED'));
  }
  await assert.rejects(withMcpClient(server, { ...access, bearerToken: 'bad\r\ntoken' }, async () => {}), hasCode('CONFIGURATION_REQUIRED'));
  assert.equal(calls.length, 0);
});

test('MCP denies unapproved tools and per-user denials without executing them', async (t) => {
  const calls = fixture(t);
  await assert.rejects(withMcpClient(server, access, mcp => mcp.callTool('delete_everything', {})), hasCode('NOT_AUTHORIZED'));
  await assert.rejects(withMcpClient(server, { authorize: () => false }, mcp => mcp.callTool('lookup', {})), hasCode('NOT_AUTHORIZED'));
  assert.equal(calls.filter(c => c.body?.includes('tools/call')).length, 0);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 2);
});

test('MCP limits arguments and detects pagination loops', async (t) => {
  const calls = fixture(t, { list: () => ({ tools: [tool], nextCursor: 'repeat' }) });
  await assert.rejects(withMcpClient(server, access, mcp => mcp.callTool('lookup', { text: 'x'.repeat(64001) })), hasCode('INVALID_ARGUMENTS'));
  await assert.rejects(withMcpClient(server, access, mcp => mcp.listTools()), hasCode('LIMIT_EXCEEDED'));
  assert.equal(calls.filter(c => c.body?.includes('tools/call')).length, 0);
});

test('MCP follows paginated tool listings', async (t) => {
  fixture(t, { list: params => params?.cursor ? { tools: [tool] } : { tools: [], nextCursor: 'page2' } });
  const result = await withMcpClient(server, access, mcp => mcp.listTools());
  assert.equal(result.length, 1);
});

test('MCP surfaces tool errors safely and does not report success', async (t) => {
  fixture(t, { call: { isError: true, content: [{ type: 'text', text: 'secret provider detail' }] } });
  await assert.rejects(withMcpClient(server, access, mcp => mcp.callTool('lookup', {})), error => hasCode('TOOL_FAILED')(error) && !error.message.includes('secret'));
});

for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'AUTHENTICATION_REQUIRED'], [429, 'RATE_LIMITED'], [503, 'UNAVAILABLE']]) {
  test(`MCP handles HTTP ${status} without retries or secret error text`, async (t) => {
    const calls = fixture(t, { fetch: () => new Response('private provider text', { status, headers: status === 429 ? { 'retry-after': '60' } : {} }) });
    await assert.rejects(withMcpClient(server, access, async () => {}), error => hasCode(code)(error) && !error.message.includes('private'));
    assert.equal(calls.length, 1);
  });
}

test('MCP aborts a hanging connection and honors cancellation', async (t) => {
  const calls = fixture(t, { fetch: (_url, init) => new Promise((_, reject) => {
    if (init.signal.aborted) reject(init.signal.reason);
    else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }) });
  await assert.rejects(withMcpClient(server, { ...access, timeoutMs: 100 }, async () => {}), hasCode('TIMEOUT'));
  const count = calls.length;
  await assert.rejects(withMcpClient(server, { ...access, signal: AbortSignal.abort() }, async () => {}), hasCode('CANCELLED'));
  assert.equal(calls.length, count);
});

test('MCP does not reuse authorization headers between requests', async (t) => {
  const calls = fixture(t);
  await withMcpClient(server, { ...access, bearerToken: 'user-a' }, async () => {});
  const count = calls.length;
  await withMcpClient(server, access, async () => {});
  assert.ok(calls.slice(count).every(c => !c.headers.has('authorization')));
});

test('MCP bounds stalled authorization and closes the session', async (t) => {
  const calls = fixture(t);
  await assert.rejects(withMcpClient(server, { timeoutMs: 100, authorize: () => new Promise(() => {}) }, mcp => mcp.callTool('lookup', {})), hasCode('TIMEOUT'));
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.equal(calls.filter(c => c.body?.includes('tools/call')).length, 0);
});

test('MCP cleans up after a callback failure and invalidates escaped sessions', async (t) => {
  const calls = fixture(t);
  let escaped;
  await assert.rejects(withMcpClient(server, access, async mcp => { escaped = mcp; throw new Error('sensitive detail'); }), hasCode('UNAVAILABLE'));
  assert.equal(calls.at(-1).method, 'DELETE');
  const count = calls.length;
  await assert.rejects(escaped.callTool('lookup', {}), hasCode('UNAVAILABLE'));
  assert.equal(calls.length, count);
});

test('MCP recognizes GitHub HTTP 403 quota responses instead of requesting new credentials', async (t) => {
  fixture(t, { fetch: () => new Response('not logged', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '30' } }) });
  await assert.rejects(withMcpClient(server, access, async () => {}), error => hasCode('RATE_LIMITED')(error) && error.retryAfterSeconds === 30);
});

test('MCP rejects an oversized protocol response before parsing it', async (t) => {
  fixture(t, { fetch: () => new Response('x'.repeat(2_000_001), { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(withMcpClient(server, access, async () => {}), error => error instanceof McpClientError);
});
