import test from 'node:test';
import assert from 'node:assert/strict';
import {startCommunity,checkCommunity,imageBytes} from '../lib/images/community.ts';
import {selfHostedImageConfig} from '../lib/images/self-hosted.ts';
import {createImageRouter} from '../lib/images/routing.ts';
const id='11111111-1111-4111-8111-111111111111';
const signal=new AbortController().signal;
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('exhausted credit falls back to an accepted community job with explicit anonymous sharing',async t=>{
 const old=process.env.AI_HORDE_API_KEY;delete process.env.AI_HORDE_API_KEY;
 t.after(()=>{if(old===undefined)delete process.env.AI_HORDE_API_KEY;else process.env.AI_HORDE_API_KEY=old;});
 let requests=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  requests++;assert.equal(url,'https://aihorde.net/api/v2/generate/async');
  const body=JSON.parse(init.body);assert.equal(body.shared,true);assert.equal(body.r2,false);assert.equal(body.censor_nsfw,true);assert.deepEqual(body.models,['Realistic Vision','Deliberate']);
  assert.equal(init.headers.apikey,'0000000000');return Response.json({id},{status:202});
 });
 const routed=await createImageRouter()(['huggingface','aihorde'],'huggingface',signal,async provider=>{
  if(provider==='huggingface')return {status:402};
  const result=await startCommunity('A teapot',signal);return {status:result.status,value:{remoteId:result.id}};
 });
 assert.deepEqual(routed,{provider:'aihorde',value:{remoteId:id}});assert.equal(requests,1);
});
test('community queue preserves waiting status then returns validated inline image',async t=>{
 let done=false;
 t.mock.method(globalThis,'fetch',async url=>String(url).includes('/check/')?Response.json({done,queue_position:12}):Response.json({generations:[{img:png,model:'Deliberate',censored:false}]}));
 assert.deepEqual(await checkCommunity(id,signal),{status:202,queue:12});done=true;
 const result=await checkCommunity(id,signal);assert.equal(result.status,200);assert.equal(result.value.mime,'image/png');assert.equal(result.model,'Deliberate');
});
test('worker URLs and censored results are never treated as successful images',async t=>{
 let censored=true;const urls=[];
 t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));return String(url).includes('/check/')?Response.json({done:true}):Response.json({generations:[{img:'https://private.example/image',censored}]});});
 assert.equal((await checkCommunity(id,signal)).status,422);censored=false;
 await assert.rejects(checkCommunity(id,signal));assert.ok(urls.every(url=>url.startsWith('https://aihorde.net/')));
 assert.throws(()=>imageBytes('PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4='));
});
test('rate-limit metadata is retained and invalid remote IDs never reach network',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'90'}});});
 assert.deepEqual(await checkCommunity(id,signal),{status:429,retryAfter:'90'});
 await assert.rejects(checkCommunity('../secret',signal));assert.equal(calls,1);
});
test('self-hosted configuration is opt-in and requires protected fixed image endpoint',t=>{
 const env={SELF_HOSTED_IMAGE_ENABLED:'true',SELF_HOSTED_IMAGE_URL:'https://images.example/v1/images/generations',SELF_HOSTED_IMAGE_API_KEY:'fixture-not-a-real-secret',SELF_HOSTED_IMAGE_MODEL:'local-model',NODE_ENV:'production'};
 for(const [key,value]of Object.entries(env)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
 assert.ok(selfHostedImageConfig());
 for(const url of ['http://localhost/v1/images/generations','https://user:pass@images.example/v1/images/generations','https://images.example/arbitrary','https://images.example/v1/images/generations?key=test']){process.env.SELF_HOSTED_IMAGE_URL=url;assert.equal(selfHostedImageConfig(),null);}
 process.env.SELF_HOSTED_IMAGE_URL=env.SELF_HOSTED_IMAGE_URL;process.env.SELF_HOSTED_IMAGE_ENABLED='false';assert.equal(selfHostedImageConfig(),null);
});
