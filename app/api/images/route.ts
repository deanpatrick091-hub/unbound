import {routeImage} from '@/lib/images/routing';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {getSession} from '@/lib/auth/session';
import {errorResponse,limitResponse} from '@/lib/api/responses';
import {getProviderConfig} from '@/lib/ai/providers';
import {consumeRequest} from '@/lib/limits/consume';
import {imageProviders} from '@/lib/images/providers';
import {imageMime} from '@/lib/images/validate';
import {boundedText} from '@/lib/integrations/server';
import {getProject,isUuid} from '@/lib/projects/server';
import {startCommunity,cancelCommunity} from '@/lib/images/community';
import {selfHostedImageConfig} from '@/lib/images/self-hosted';
export const maxDuration=120;
export async function GET(){
 const {supabase,user}=await getSession();if(!user)return errorResponse(401,'unauthorized','Sign in to continue.');
 const {data,error}=await supabase.from('project_assets').select('id,prompt,provider,mime_type,created_at,project_id').eq('owner_id',user.id).is('history_deleted_at',null).order('created_at',{ascending:false}).limit(30);
 if(error)return errorResponse(503,'storage_error','Image history could not be loaded.');
 const jobs=await supabase.from('integration_jobs').select('id,input').eq('user_id',user.id).eq('provider','aihorde').is('result',null).gt('created_at',new Date(Date.now()-1800000).toISOString()).order('created_at',{ascending:false}).limit(1);
 return Response.json({images:data,pending:jobs.data?.[0]??null},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return errorResponse(403,'invalid_request','Reload this page before generating an image.');
 const {supabase,user}=await getSession();if(!user)return errorResponse(401,'unauthorized','Sign in to continue.');
 let body;try{body=await request.json();}catch{return errorResponse(400,'invalid_request','Enter an image description.');}
 const prompt=body?.prompt;const provider=body?.provider??imageProviders()[0]?.id;
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>4000)return errorResponse(400,'invalid_request','Use an image description between 1 and 4,000 characters.');
 if(!imageProviders().length)return errorResponse(503,'not_configured','No image connection is available right now.');
 const projectId=body.projectId??null;
 if(projectId){const p=isUuid(projectId)?await getProject(projectId):null;if(!p||p.role==='viewer')return errorResponse(403,'invalid_request','You cannot save images to this project.');}
 const limit=await consumeRequest(supabase,'build');if(!limit.allowed)return limitResponse(limit);if(limit.degraded)return errorResponse(503,'upstream_error','The usage check is temporarily unavailable.');
 const choices=imageProviders().filter(p=>(p.id!=='aihorde'||body.communityConsent===true)&&(p.id!=='huggingface'||provider==='huggingface')).sort((a,b)=>Number(b.id===provider)-Number(a.id===provider));
 if(provider==='aihorde'&&body.communityConsent!==true)return errorResponse(400,'invalid_request','Allow community processing before using AI Horde. Anonymous generations are shared for dataset research.');
 const active=await supabase.from('integration_jobs').select('id,input').eq('user_id',user.id).eq('provider','aihorde').is('result',null).gt('created_at',new Date(Date.now()-1800000).toISOString()).limit(1).maybeSingle();
 if(active.data)return Response.json({jobId:active.data.id,prompt:active.data.input,provider:'aihorde'},{status:202,headers:{'Cache-Control':'private, no-store'}});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(100000)]);
 let result;
 try { result=await routeImage<{src:string;mime:string}|{remoteId:string}>(choices.map(choice=>choice.id),provider,signal,async provider=>{
 if(provider==='aihorde'){const queued=await startCommunity(prompt.trim(),signal);return {...queued,value:queued.id?{remoteId:queued.id}:undefined};}
 if(provider==='self-hosted'){
  const local=selfHostedImageConfig();if(!local)return {status:503};
  const response=await fetch(local.url,{method:'POST',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+local.key,'Content-Type':'application/json'},body:JSON.stringify({model:local.model,prompt:prompt.trim(),n:1,size:'512x512',response_format:'b64_json'}),signal:AbortSignal.any([signal,AbortSignal.timeout(45000)])});
  if(!response.ok){await response.body?.cancel();return {status:response.status,retryAfter:response.headers.get('retry-after')};}
  const d=JSON.parse(await boundedText(response,6000000));const {imageBytes}=await import('@/lib/images/community');return {status:200,value:imageBytes(d.data?.[0]?.b64_json)};
 }
 const config=getProviderConfig(provider==='huggingface'?'huggingface':'cloudflare');
 if(!config||config.kind!=='openai-compatible')return {status:503};
  const hf=provider==='huggingface';
  const url=hf?'https://router.huggingface.co/nscale/v1/images/generations':config.baseUrl.replace(/\/v1$/,'/run/@cf/black-forest-labs/flux-1-schnell');
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify(hf?{model:'black-forest-labs/FLUX.1-schnell',prompt:prompt.trim(),response_format:'b64_json',size:'512x512',n:1}:{prompt:prompt.trim(),steps:4}),signal:AbortSignal.any([signal,AbortSignal.timeout(choices.length>1?45000:95000)])});
  if(!response.ok){console.warn('[images] provider failure',{provider,status:response.status});await response.body?.cancel();return {status:response.status,retryAfter:response.headers.get('retry-after')};}
  const data=JSON.parse(await boundedText(response,6000000));const b64=hf?data.data?.[0]?.b64_json:data.result?.image;
  if(typeof b64!=='string'||b64.length>5500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error('Invalid image');
  const mime=imageMime(b64);if(!mime)throw Error('Unsupported image format');
  return {status:200,value:{src:`data:${mime};base64,${b64}`,mime}};
 }); } catch { return errorResponse(504,'network_error','Image generation was interrupted. Your saved images are still available.'); }
 if('error' in result){
  const headers={'Retry-After':String(result.retryAfter),'Cache-Control':'private, no-store'};
  if(result.error==='quota')return errorResponse(402,'quota_exhausted','The connected image provider has no inference credit available. The site owner must check its credit balance or configure another provider. Retrying immediately will not restore credit.',headers);
  if(result.error==='rate_limit')return errorResponse(429,'rate_limited','The image provider is rate limited. Wait before trying again.',headers);
  if(result.error==='credentials')return errorResponse(503,'not_configured','The image provider rejected its credentials or permissions. The site owner must check the server connection.',headers);
  return errorResponse(503,'network_error','No connected image provider could complete this request. Please try again later.',headers);
 }
 if('remoteId' in result.value){
  const job=await supabase.from('integration_jobs').insert({user_id:user.id,provider:'aihorde',remote_id:result.value.remoteId,input:prompt.trim()}).select('id').single();
  if(job.error){await cancelCommunity(result.value.remoteId);return errorResponse(503,'storage_error','Could not save the queued image request. Please retry later.');}
  return Response.json({jobId:job.data.id,prompt:prompt.trim(),provider:'aihorde',message:'Queued with AI Horde. The image will save to Recent Images; you can then add it to a project.'},{status:202,headers:{'Cache-Control':'private, no-store'}});
 }
 const {src,mime}=result.value;
 const saved=await supabase.from('project_assets').insert({owner_id:user.id,project_id:projectId,prompt:prompt.trim(),provider:result.provider,mime_type:mime,data_url:src}).select('id,created_at').single();
 return Response.json({src,provider:result.provider,id:saved.data?.id,mime,warning:saved.error?'Your image was generated but could not be saved. Download it now to keep a copy.':undefined},{headers:{'Cache-Control':'private, no-store'}});
}
