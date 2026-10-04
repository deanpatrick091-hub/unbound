import test from 'node:test';
import assert from 'node:assert/strict';
import { hasZeroPricing } from '../lib/ai/free-policy.ts';
import { getSiteOrigin } from '../lib/auth/site-url.ts';
import { safeNextPath } from '../lib/auth/redirect.ts';
import { streamOpenAICompatible } from '../lib/ai/openai-compatible.ts';
import { getProviderConfig } from '../lib/ai/providers.ts';
const config = { kind: 'openai-compatible', baseUrl: 'https://provider.invalid/v1', apiKey: 'test', supportsStreamUsage: true, zeroPriceOnly: true };
const options = { model: 'openrouter:test/free', systemInstruction: 'Be helpful.', turns: [{ role: 'user', content: 'Hello' }], maxTokens: 512 };
async function collect(source, status=200) {
  const original = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(source, { status, headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const events=[];
    for await(const event of streamOpenAICompatible(config,'Test','test/free',options)) events.push(event);
    return { events, sent };
  } finally { globalThis.fetch = original; }
}
test('zero pricing rejects hidden charges, missing prices and invalid numbers', () => {
  assert.equal(hasZeroPricing({prompt:'0',completion:'0',request:'0'}),true);
  for(const price of [undefined,{}, {prompt:'',completion:'0'}, {prompt:0,completion:0,image:0.001},{prompt:0,completion:0,request:null},{prompt:0,completion:'NaN'}]) assert.equal(hasZeroPricing(price),false);
});
test('production email links cannot point at localhost or caller headers',()=>{
  assert.equal(getSiteOrigin({NODE_ENV:'production'}),'https://unbound-lilac.vercel.app');
  assert.equal(getSiteOrigin({SITE_URL:'https://unbound-lilac.vercel.app/',NODE_ENV:'production'}),'https://unbound-lilac.vercel.app');
  for(const url of ['http://localhost:3000','https://localhost','https://user:pass@example.com','https://example.com/path','javascript:alert(1)']) assert.throws(()=>getSiteOrigin({SITE_URL:url,NODE_ENV:'production'}));
});
test('post-login paths preserve reset queries without allowing external redirects',()=>{
  for(const path of ['//evil.test','/\\evil.test','https://evil.test','/\nevil.test']) assert.equal(safeNextPath(path),'/');
  assert.equal(safeNextPath('/reset-password?from=email#form'),'/reset-password?from=email#form');
});
test('OpenRouter requests always enforce a zero-price ceiling',async()=>{
  const {events,sent}=await collect('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n');
  assert.deepEqual(sent.provider.max_price,{prompt:0,completion:0,request:0,image:0});
  assert.deepEqual(events.map(e=>e.type),['text','done']);
});
test('interrupted streams produce an error, never false success',async()=>{
  const {events}=await collect('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  assert.deepEqual(events.map(e=>e.type),['text','error']);
});
test('malformed chunks surface errors',async()=>{
  const {events}=await collect('data: invalid-json\n\n');
  assert.equal(events.at(-1).type,'error');
});
test('multiline SSE and CRLF assemble a single event',async()=>{
  const {events}=await collect('data: {"choices":\r\ndata: [{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  assert.deepEqual(events.map(e=>e.type),['text','done']);
});
test('Cerebras is never enabled even when a legacy key exists',()=>assert.equal(getProviderConfig('cerebras'),null));

test('discovery blocks arbitrary paid IDs and harness-restricted models',async()=>{
  const {getAvailableModels,getAvailableModel,invalidateModelCache}=await import('../lib/ai/discovery.ts');
  const original=globalThis.fetch; const old=process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY='test'; invalidateModelCache();
  globalThis.fetch=async(url)=>!String(url).startsWith("https://openrouter.ai/")?Response.json({data:[]}):Response.json({data:[
    {id:'test/free',pricing:{prompt:'0',completion:'0'}},
    {id:'test/paid',pricing:{prompt:'0.1',completion:'0.1'}},
    {id:'test/hidden-charge',pricing:{prompt:'0',completion:'0',request:'0.1'}},
    {id:'thinkingmachines/inkling:free',pricing:{prompt:'0',completion:'0'}},
    {id:'test/embedding',pricing:{prompt:'0',completion:'0'}},
  ]});
  try{
    const ids=(await getAvailableModels()).filter(m=>m.provider==='openrouter').map(m=>m.id);
    assert.deepEqual(ids,['openrouter:openrouter/free','openrouter:test/free']);
    assert.equal(await getAvailableModel('openrouter:test/paid'),undefined);
  }finally{globalThis.fetch=original;if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;invalidateModelCache();}
});
test('generation never retries after partial text or user cancellation',async()=>{
  const {streamWithFallback}=await import('../lib/ai/generate.ts');
  const {invalidateModelCache}=await import('../lib/ai/discovery.ts');
  const original=globalThis.fetch; const old=process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY='test';invalidateModelCache();let calls=0;
  globalThis.fetch=async(url)=>{
    if(!String(url).endsWith('/chat/completions'))return Response.json({data:[{id:'test/free',pricing:{prompt:'0',completion:'0'}}]});
    calls++;return new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  };
  try{
    const events=[];for await(const e of streamWithFallback(options))events.push(e);
    assert.deepEqual(events.map(e=>e.type),['text','error']);assert.equal(calls,1);
    const controller=new AbortController();controller.abort();
    const cancelled=[];for await(const e of streamWithFallback({...options,signal:controller.signal}))cancelled.push(e);
    assert.equal(cancelled[0].code,'aborted');assert.equal(calls,1);
  }finally{globalThis.fetch=original;if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;invalidateModelCache();}
});

test('structured text chunks render text without object or thinking artifacts',async()=>{
  const {events}=await collect('data: {"choices":[{"delta":{"content":[{"type":"thinking","text":"hidden"},{"type":"text","text":"Hello"}]},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  assert.equal(events[0].text,'Hello');assert.equal(events.at(-1).type,'done');
});
test('response length limits cannot masquerade as completed answers',async()=>{
  const {events}=await collect('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n');
  assert.deepEqual(events.map(e=>e.type),['text','error']);
});
test('payment-required responses stop at the free allowance',async()=>{
  const {events}=await collect('{"error":{"message":"Credits exhausted"}}',402);
  assert.equal(events.at(-1).code,'quota_exhausted');
});

test('Kilo discovery admits only explicitly free IDs with every price zero',async()=>{
 const {getAvailableModels,invalidateModelCache}=await import('../lib/ai/discovery.ts');
 const original=globalThis.fetch;invalidateModelCache();
 globalThis.fetch=async(url)=>Response.json({data:String(url).startsWith('https://api.kilo.ai/')?[
  {id:'safe/model:free',pricing:{prompt:'0',completion:'0'}},
  {id:'unknown/model',pricing:{prompt:'0',completion:'0'}},
  {id:'paid/model:free',pricing:{prompt:'0.1',completion:'0'}},
  {id:'hidden/model:free',pricing:{prompt:'0',completion:'0',request:'1'}},
 ]:[]});
 try{assert.deepEqual((await getAvailableModels()).filter(m=>m.provider==='kilo').map(m=>m.id),['kilo:safe/model:free']);}
 finally{globalThis.fetch=original;invalidateModelCache();}
});
