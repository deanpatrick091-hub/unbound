import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const nextServerPath = require.resolve('next/server');
// Only the session/cookie boundary and remote providers are fixtures. Route
// handlers, token encryption, OAuth validation, store and official MCP SDK run.
registerHooks({ resolve(specifier, context, next) {
  const code = specifier === '@/lib/auth/session' ? 'export async function getSession(){return globalThis.githubRouteFixture.session()}'
    : specifier === '@/lib/limits/consume' ? 'export async function consumeRequest(){return {allowed:true,degraded:false}}'
    : specifier === 'next/headers' ? 'export async function cookies(){return globalThis.githubRouteFixture.cookies}' : null;
  if (code) return { url: 'data:text/javascript,' + encodeURIComponent(code), shortCircuit: true };
  if (specifier === 'next/server') return { url: new URL('file://' + nextServerPath).href, shortCircuit: true };
  return next(specifier, context);
} });
const connect = await import('../app/api/integrations/github/connect/route.ts');
const callback = await import('../app/api/integrations/github/callback/route.ts');
const status = await import('../app/api/integrations/github/route.ts');
const run = await import('../app/api/integrations/github/run/route.ts');
const disconnect = await import('../app/api/integrations/github/disconnect/route.ts');
const { context, credentialSchema, decrypt, encrypt, OAUTH_COOKIE } = await import('../lib/github/security.ts');
const root = 'https://unbound.example';
function setup(t) {
  const env = { GITHUB_OAUTH_CLIENT_ID: 'Iv1.fixture', GITHUB_OAUTH_CLIENT_SECRET: 'fixture-secret-not-a-real-key', GITHUB_OAUTH_REDIRECT_URI: root + '/api/integrations/github/callback', GITHUB_APP_SLUG: 'unbound-fixture', INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
  for (const [key, value] of Object.entries(env)) { const previous = process.env[key]; process.env[key] = value; t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }); }
  const tables = { github_connections: new Map(), github_oauth_states: new Map() }, jar = new Map(), network = [];
  let who = 'user-a', anonymous = false, tokens = 0;
  function client(uid) {
    return {
      auth: { getUser: async () => ({ data: { user: uid ? { id: uid, is_anonymous: anonymous } : null }, error: null }) },
      from(table) {
        const map = tables[table], filters = []; let mode = 'select', changes, single = false;
        const q = {
          select() { return q; }, eq(k,v) { filters.push(row => row[k] === v); return q; },
          gt(k,v) { filters.push(row => row[k] > v); return q; }, lt(k,v) { filters.push(row => row[k] < v); return q; },
          update(value) { mode='update'; changes=value; return q; }, upsert(value) { mode='upsert'; changes=value; return q; },
          delete() { mode='delete'; return q; }, maybeSingle() { single=true; return q; },
          then(resolve, reject) { return Promise.resolve().then(() => {
            if (!uid || anonymous) return { data: null, error: { message: 'denied' } };
            if (mode === 'upsert') { map.set(uid, { ...changes }); return { data: null, error: null }; }
            const row = map.get(uid);
            if (!row || !filters.every(f => f(row))) return { data: single ? null : [], error: null };
            if (mode === 'update') Object.assign(row, changes);
            if (mode === 'delete') map.delete(uid);
            return { data: single ? { ...row } : [{ ...row }], error: null };
          }).then(resolve, reject); },
        }; return q;
      },
      async rpc(_name, args) {
        const state = tables.github_oauth_states.get(uid);
        if (!state || !state.claimed || state.state_hash !== args.p_state_hash || new Date(state.expires_at).getTime() <= Date.now()) return { error: { message: 'expired' } };
        tables.github_connections.set(uid, { user_id: uid, connection_id: args.p_connection_id, credential_ciphertext: args.p_ciphertext, verified_at: new Date().toISOString(), refresh_lock_until: '1970-01-01T00:00:00Z', refresh_lock_id: null });
        tables.github_oauth_states.delete(uid); return { error: null };
      },
    };
  }
  globalThis.githubRouteFixture = { session: async () => ({ user: who ? { id: who } : null, supabase: client(who) }), cookies: { get: key => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key,value,opts) => { if (opts.maxAge === 0) jar.delete(key); else jar.set(key,value); assert.equal(opts.httpOnly, true); assert.equal(opts.sameSite, 'lax'); assert.equal(opts.secure, true); } } };
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = String(input), headers = new Headers(init.headers); network.push({ url, init });
    if (url.endsWith('/.well-known/oauth-protected-resource/mcp/readonly')) return Response.json({ resource: 'https://api.githubcopilot.com/mcp/readonly', authorization_servers: ['https://github.com/login/oauth'] });
    if (url.endsWith('/.well-known/oauth-authorization-server/login/oauth')) return Response.json({ issuer: 'https://github.com/login/oauth', authorization_endpoint: 'https://github.com/login/oauth/authorize', token_endpoint: 'https://github.com/login/oauth/access_token', code_challenge_methods_supported: ['S256'] });
    if (url.endsWith('/mcp/readonly')) {
      if (!headers.has('authorization')) return new Response(null, { status:401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/readonly"' } });
      if (init.method === 'GET') return new Response(null, { status:405 });
      if (init.method === 'DELETE') return new Response(null, { status:204 });
      const msg=JSON.parse(init.body); if(msg.id===undefined) return new Response(null,{status:202});
      const result=msg.method==='initialize' ? {protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}} : msg.method==='tools/list' ? {tools:['search_repositories','get_file_contents','list_issues','issue_read'].map(name=>({name,inputSchema:{type:'object'}}))} : {content:[{type:'text',text:'Read-only fixture result'}]};
      return Response.json({jsonrpc:'2.0',id:msg.id,result},{headers:{'mcp-session-id':'fixture'}});
    }
    if (url.endsWith('/access_token')) { tokens++; return Response.json({ access_token:'ghu_fixture'+tokens, refresh_token:'ghr_fixture'+tokens, expires_in:28800, refresh_token_expires_in:15897600, token_type:'bearer', scope:'' }); }
    if (url === 'https://api.github.com/user') return Response.json({ id: 42, login:'fixture-account' });
    if (url.includes('/user/installations')) return Response.json({installations:[{permissions:{contents:'read',issues:'read',metadata:'read'}}]});
    if (url.endsWith('/token') && init.method==='DELETE') return new Response(null,{status:204});
    throw Error('Unexpected fixture network request');
  });
  const request = (part, body={}) => new Request(root+'/api/integrations/github/'+part, { method:'POST', headers:{origin:root,host:'unbound.example','Content-Type':'application/json'}, body:JSON.stringify(body) });
  const start = async () => { const response=await connect.POST(request('connect')); assert.equal(response.status,200); return new URL((await response.json()).url).searchParams.get('state'); };
  const finish = state => callback.GET(new Request(root+'/api/integrations/github/callback?code=fixture-code&state='+state));
  return {tables,jar,network,request,start,finish,who:value=>{who=value;},anonymous:value=>{anonymous=value;},tokenCalls:()=>tokens};
}
test('OAuth routes connect, run reads, refresh, and disconnect using isolated fixture account', async t => {
  const f=setup(t), state=await f.start();
  const done=await f.finish(state); assert.match(done.headers.get('location'), /github=connected/);
  const row=f.tables.github_connections.get('user-a'); assert.ok(!row.credential_ciphertext.includes('ghu_'));
  const response=await status.GET(new Request(root+'/api/integrations/github')); const view=await response.json(); assert.equal(view.state,'CONNECTED'); assert.equal(view.login,'fixture-account'); assert.ok(!JSON.stringify(view).includes('Token'));
  for (const input of [{action:'repositories'},{action:'file',owner:'a',repo:'b',path:'README.md'},{action:'issues',owner:'a',repo:'b'},{action:'issue',owner:'a',repo:'b',number:1}]) { const read=await run.POST(f.request('run',input)); assert.equal(read.status,200); assert.equal((await read.json()).trust,'untrusted_external_data'); }
  const stored=decrypt(row.credential_ciphertext,context('user-a',row.connection_id),credentialSchema); row.credential_ciphertext=encrypt({...stored,expiresAt:Date.now()-1000},context('user-a',row.connection_id));
  const refreshed=await run.POST(f.request('run',{action:'repositories'})); assert.equal(refreshed.status,200); assert.equal(f.tokenCalls(),2);
  const stopped=await disconnect.POST(f.request('disconnect')); assert.deepEqual((await stopped.json()).revoked,true); assert.equal(f.tables.github_connections.size,0);
  assert.equal((await run.POST(f.request('run',{action:'repositories'}))).status,409);
});
test('OAuth callback rejects cross-user attempts, then rejects replay after a successful callback', async t => {
  const f=setup(t), state=await f.start(), browser=f.jar.get(OAUTH_COOKIE);
  f.who('user-b'); const other=await f.finish(state); assert.match(other.headers.get('location'),/github=failed/); assert.equal(f.tokenCalls(),0);
  f.who('user-a'); f.jar.set(OAUTH_COOKIE,browser); assert.match((await f.finish(state)).headers.get('location'),/github=connected/);
  f.jar.set(OAUTH_COOKIE,browser); assert.match((await f.finish(state)).headers.get('location'),/github=failed/); assert.equal(f.tokenCalls(),1);
});
test('OAuth callback rejects wrong browser and expired state without exchanging a code', async t => {
  const f=setup(t), state=await f.start(), browser=f.jar.get(OAUTH_COOKIE);
  f.jar.set(OAUTH_COOKIE,'x'.repeat(43)); assert.match((await f.finish(state)).headers.get('location'),/github=failed/);
  f.jar.set(OAUTH_COOKIE,browser); f.tables.github_oauth_states.get('user-a').expires_at='2000-01-01'; assert.match((await f.finish(state)).headers.get('location'),/github=failed/); assert.equal(f.tokenCalls(),0);
});
test('OAuth start and tool routes reject anonymous sessions, cross-origin requests and writes', async t => {
  const f=setup(t); f.anonymous(true); assert.equal((await connect.POST(f.request('connect'))).status,401); f.anonymous(false);
  const forged=new Request(root+'/api/integrations/github/connect',{method:'POST',headers:{origin:'https://evil.example',host:'unbound.example'}}); assert.equal((await connect.POST(forged)).status,403);
  const state=await f.start(); await f.finish(state);
  assert.equal((await run.POST(f.request('run',{action:'create_issue',owner:'a',repo:'b'}))).status,400);
  f.who('user-b'); assert.equal((await run.POST(f.request('run',{action:'repositories'}))).status,409);
});
test('Disconnect invalidates an outstanding OAuth callback', async t => {
  const f=setup(t), state=await f.start(); assert.equal((await disconnect.POST(f.request('disconnect'))).status,200);
  assert.match((await f.finish(state)).headers.get('location'),/github=failed/); assert.equal(f.tokenCalls(),0); assert.equal(f.tables.github_connections.size,0);
});
