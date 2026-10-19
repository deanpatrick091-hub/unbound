import 'server-only';
import {boundedText} from '@/lib/integrations/server';
import {imageMime} from '@/lib/images/validate';
export const HORDE_MODEL_NAMES=['Realistic Vision','Deliberate'];
const root='https://aihorde.net/api/v2/generate';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function imageBytes(b64:unknown){
 if(typeof b64!=='string'||b64.length>5500000||b64.length<24||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error('Invalid image bytes');
 const mime=imageMime(b64);if(!mime)throw Error('Unsupported image format');return {src:`data:${mime};base64,${b64}`,mime};
}
async function call(path:string,signal:AbortSignal,method='GET',body?:unknown){
 return fetch(root+path,{method,headers:{'Content-Type':'application/json',apikey:process.env.AI_HORDE_API_KEY?.trim()||'0000000000','Client-Agent':'UnboundAI:1.0:github.com/deanpatrick091-hub/unbound'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
}
export async function startCommunity(prompt:string,signal:AbortSignal){
 const r=await call('/async',signal,'POST',{prompt,models:HORDE_MODEL_NAMES,params:{n:1,width:512,height:512,steps:20,sampler_name:'k_euler',cfg_scale:7},nsfw:false,censor_nsfw:true,trusted_workers:true,validated_backends:true,r2:false,shared:!process.env.AI_HORDE_API_KEY?.trim(),slow_workers:true});
 if(!r.ok){await r.body?.cancel();return {status:r.status,retryAfter:r.headers.get('retry-after')};}
 const d=JSON.parse(await boundedText(r,20000));if(!uuid.test(d.id??''))throw Error('Invalid image job');return {status:202,id:d.id as string};
}
export async function cancelCommunity(id:string){if(!uuid.test(id))return false;try{const r=await call('/status/'+id,AbortSignal.timeout(10000),'DELETE');await r.body?.cancel();return r.ok;}catch{return false;}}
export async function checkCommunity(id:string,signal:AbortSignal){
 if(!uuid.test(id))throw Error('Invalid image job');
 const r=await call('/check/'+id,signal);if(!r.ok){await r.body?.cancel();return {status:r.status,retryAfter:r.headers.get('retry-after')};}
 const d=JSON.parse(await boundedText(r,30000));if(d.faulted)return {status:502};if(!d.done)return {status:202,queue:d.queue_position as number|undefined};
 const full=await call('/status/'+id,signal);if(!full.ok){await full.body?.cancel();return {status:full.status};}
 const result=JSON.parse(await boundedText(full,6000000));const g=result.generations?.[0];
 if(!g||g.censored)return {status:422};
 // Inline data only: worker-supplied URLs must never become server-side fetches.
 return {status:200,value:imageBytes(g.img),model:typeof g.model==='string'?g.model:'AI Horde'};
}
