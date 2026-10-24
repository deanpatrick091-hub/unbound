import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTavily,retrySeconds,sourceLinks} from '../lib/integrations/tavily.ts';
import {integrationConfig} from '../lib/integrations/server.ts';
import {runResearch} from '../lib/integrations/research.ts';
import {needsWebSearch,selectedChatTool} from '../lib/chat/tools.ts';
import {parseChatRequest} from '../lib/chat/validation.ts';

const fixtureKey='tvly-fixture-not-a-real-key';
const fixture={results:[{title:'Official [report]',url:'https://example.com/report',content:'<b>Fresh facts</b> from a source.'}]};
test('Tavily uses server-only bearer auth, one fixed basic search, safe bounded sources and no extra feature gate',async t=>{
 const old=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY=fixtureKey;t.after(()=>{if(old===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=old;});
 assert.equal(integrationConfig('tavily').configured,true);
 let calls=0;t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls++;assert.equal(url,'https://api.tavily.com/search');assert.equal(options.headers.Authorization,'Bearer '+fixtureKey);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  const body=JSON.parse(options.body);assert.equal(body.search_depth,'basic');assert.equal(body.auto_parameters,false);assert.equal(body.include_answer,false);assert.equal(body.include_raw_content,false);assert.equal(body.include_images,false);assert.equal(body.max_results,5);assert.ok(!options.body.includes(fixtureKey));
  return Response.json({results:[...fixture.results,...fixture.results,{title:'hostile',url:'javascript:alert(1)',content:'bad'},{url:'https://user:pass@example.com',content:'bad'}]});
 });
 const r=await runResearch('tavily','current official report');assert.equal(calls,1);assert.equal(r.sources.length,1);assert.equal(r.sources[0].excerpt,'Fresh facts from a source.');assert.match(r.content,/\]\(<https:\/\/example.com\/report>\)/);assert.ok(!JSON.stringify(r).includes(fixtureKey));
});
test('missing credentials and invalid input fail before any request',async t=>{
 const old=process.env.TAVILY_API_KEY;delete process.env.TAVILY_API_KEY;t.after(()=>{if(old!==undefined)process.env.TAVILY_API_KEY=old;});
 t.mock.method(globalThis,'fetch',()=>{throw Error('must not call');});
 await assert.rejects(searchTavily('news'),e=>e.status===503&&e.message.includes('TAVILY_API_KEY'));
 await assert.rejects(searchTavily('x'.repeat(4001)),e=>e.status===400);
});
test('credit, credentials, malformed responses and outages are distinct, sanitized and never retried',async t=>{
 const old=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY=fixtureKey;t.after(()=>{if(old===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=old;});
 let status=432,calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('private upstream diagnostic '+fixtureKey,{status});});
 for(const [code,expected,pattern] of [[432,402,/credit or account usage limit/],[433,402,/credit or account usage limit/],[402,402,/credit or account usage limit/],[401,503,/credentials/],[403,503,/credentials/],[500,503,/temporarily unavailable/],[400,400,/shorter/],[200,502,/valid results/]]){
  status=code;const before=calls;await assert.rejects(searchTavily('news'),e=>e.status===expected&&pattern.test(e.message)&&!e.message.includes(fixtureKey));assert.equal(calls,before+1);
 }
});
test('empty results stay empty and an aborted request never searches',async t=>{
 const old=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY=fixtureKey;t.after(()=>{if(old===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=old;});
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({results:[]});});
 assert.deepEqual((await searchTavily('empty')).sources,[]);const abort=new AbortController();abort.abort();await assert.rejects(searchTavily('cancelled',abort.signal),e=>e.status===499);assert.equal(calls,1);
});
test('timeout is bounded and identified without exposing thrown network details',async t=>{
 const old=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY=fixtureKey;t.after(()=>{if(old===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=old;});
 const controller=new AbortController();t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,15000);return controller.signal;});
 t.mock.method(globalThis,'fetch',async()=>{controller.abort();throw Error('secret network detail');});
 await assert.rejects(searchTavily('news'),e=>e.status===504&&/timed out/.test(e.message)&&!e.message.includes('secret'));
});
test('429 respects numeric and date Retry-After and stops immediate resubmission',async t=>{
 const old=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY=fixtureKey;t.after(()=>{if(old===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=old;});
 assert.equal(retrySeconds('120'),120);assert.equal(retrySeconds('nonsense'),60);assert.equal(retrySeconds(new Date(120000).toUTCString(),60000),60);
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('private',{status:429,headers:{'Retry-After':'120'}});});
 for(let i=0;i<2;i++)await assert.rejects(searchTavily('news'),e=>e.status===429&&e.retryAfter>0&&/rate limited/.test(e.message));assert.equal(calls,1);
});
test('search routing covers explicit/current questions and preserves ordinary chat, media, attachments and opt-out',()=>{
 for(const text of ['Search the web for Scotland tourism','Look up the newest release of Next.js','What is the latest news?','Who is the UK prime minister?','Search for official Tavily documentation','Weather in Leeds','What is the exchange rate?'])assert.equal(needsWebSearch(text),true,text);
 for(const text of ['Explain photosynthesis','Write a poem about today','Build a website for current trends','Do not search the web; explain gravity','Without browsing explain the latest CSS' ])assert.equal(needsWebSearch(text),false,text);
 assert.equal(selectedChatTool('latest news'),'tavily');assert.equal(selectedChatTool('Generate an image of today'),'image');assert.equal(selectedChatTool('latest news',{tool:'crossref'}),'crossref');assert.equal(selectedChatTool('latest news',{attachments:[{name:'x.txt',text:'secret'}]}),undefined);
 assert.equal(parseChatRequest({content:'hello',tools:{tool:'tavily'}}).ok,true);
 const links=sourceLinks([{title:'![image](evil) <script>',url:'https://example.com/a(b)',excerpt:''}]);assert.ok(!links.includes('![image]'));assert.match(links,/<https:\/\/example.com\/a\(b\)>/);
});
