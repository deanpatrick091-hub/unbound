import test from 'node:test';
import assert from 'node:assert/strict';
import {comfyConfig,generateComfyVideo} from '../lib/videos/comfy.ts';
function config(t){
 const vars={COMFYUI_VIDEO_ENABLED:'true',COMFYUI_VIDEO_VERIFIED:'true',COMFYUI_VIDEO_URL:'https://gpu.example/',COMFYUI_VIDEO_API_KEY:'fixture-only-not-a-real-credential-12345',COMFYUI_VIDEO_WORKFLOW:JSON.stringify({'1':{inputs:{text:'template'},class_type:'CLIPTextEncode'},'2':{inputs:{},class_type:'SaveVideo'}}),COMFYUI_VIDEO_PROMPT_NODE:'1',COMFYUI_VIDEO_OUTPUT_NODE:'2'};
 for(const [k,v]of Object.entries(vars)){const old=process.env[k];process.env[k]=v;t.after(()=>{if(old===undefined)delete process.env[k];else process.env[k]=old;});}
}
test('video worker requires explicit verification and authenticated HTTPS fixed host',t=>{
 config(t);assert.ok(comfyConfig());process.env.COMFYUI_VIDEO_VERIFIED='false';assert.equal(comfyConfig(),null);process.env.COMFYUI_VIDEO_VERIFIED='true';
 for(const url of ['http://localhost:8188/','https://u:p@gpu.example/','https://gpu.example/path','https://gpu.example/?key=secret']){process.env.COMFYUI_VIDEO_URL=url;assert.equal(comfyConfig(),null);}
});
test('ComfyUI submits server-owned workflow, polls job, validates MP4 and deletes only its queue entry',async t=>{
 config(t);const id='11111111-1111-4111-8111-111111111111';const seen=[];
 const mp4=Buffer.alloc(24);mp4.write('ftyp',4);
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  seen.push(String(url));assert.equal(init.redirect,'error');assert.ok(init.headers.Authorization.startsWith('Bearer '));
  if(url.endsWith('/prompt')){const body=JSON.parse(init.body);assert.equal(body.prompt['1'].inputs.text,'A teapot');return Response.json({prompt_id:id});}
  if(url.includes('/history/'))return Response.json({[id]:{status:{completed:true},outputs:{'2':{videos:[{filename:'clip.mp4',subfolder:'',type:'output'}]}}}});
  if(url.includes('/view?'))return new Response(mp4);
  assert.deepEqual(JSON.parse(init.body),{delete:[id]});return Response.json({});
 });
 const result=await generateComfyVideo('A teapot',AbortSignal.timeout(10000));assert.equal(result.bytes.length,24);assert.equal(seen.length,4);assert.equal(comfyConfig().workflow['1'].inputs.text,'template');
});
test('invalid credentials are not retried and never returned as provider output',async t=>{
 config(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('private error',{status:401});});
 await assert.rejects(generateComfyVideo('private prompt',AbortSignal.timeout(5000)),e=>e.httpResponse.status===401&&!e.message.includes('private'));assert.equal(calls,1);
});
