import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImageRouter} from '../lib/images/routing.ts';
const signal = new AbortController().signal;
test('image quota automatically switches to another connected provider and skips cooling provider', async()=>{
 let time=0;const route=createImageRouter(()=>time);const calls=[];
 const attempt=async id=>{calls.push(id);return id==='hf'?{status:429,retryAfter:'120'}:{status:200,value:'real-result'};};
 assert.deepEqual(await route(['cf','hf'],'hf',signal,attempt),{provider:'cf',value:'real-result'});
 await route(['hf','cf'],'hf',signal,attempt);
 assert.deepEqual(calls,['hf','cf','cf']);
 time=120001;await route(['hf','cf'],'hf',signal,attempt);
 assert.deepEqual(calls.slice(-2),['hf','cf']);
});
test('mixed failures are not misreported as all quotas exhausted', async()=>{
 const route=createImageRouter();
 const result=await route(['hf','cf'],'hf',signal,async id=>({status:id==='hf'?402:503}));
 assert.equal(result.error,'unavailable');
});
test('all exhausted providers return bounded backoff including HTTP date', async()=>{
 const route=createImageRouter(()=>0);
 assert.deepEqual(await route(['hf'],'hf',signal,async()=>({status:429,retryAfter:new Date(9000000).toUTCString()})),{error:'quota',retryAfter:900});
});
test('invalid image or network failure falls back; aborted request never starts another provider', async()=>{
 const route=createImageRouter();const calls=[];
 assert.equal((await route(['a','b'],'a',signal,async id=>{if(id==='a')throw Error('invalid image');return {status:200,value:'image'};})).provider,'b');
 const abort=new AbortController();
 await assert.rejects(createImageRouter()(['a','b'],'a',abort.signal,async id=>{calls.push(id);abort.abort();throw Error();}));
 assert.deepEqual(calls,['a']);
});
test('successful provider is not called twice and unsupported providers cannot be introduced by selection',async()=>{
 const calls=[];
 const result=await createImageRouter()(['hf','hf'],'unconfigured',signal,async id=>{calls.push(id);return {status:200,value:'image'};});
 assert.deepEqual(calls,['hf']);assert.equal(result.provider,'hf');
});
