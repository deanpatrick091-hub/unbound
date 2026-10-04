import {getSession} from '@/lib/auth/session';
import {errorResponse,limitResponse} from '@/lib/api/responses';
import {getProviderConfig} from '@/lib/ai/providers';
import {consumeRequest} from '@/lib/limits/consume';
import {imageProviders} from '@/lib/images/providers';
import {imageMime} from '@/lib/images/validate';
import {boundedText} from '@/lib/integrations/server';
import {getProject,isUuid} from '@/lib/projects/server';
export const maxDuration=120;
export async function GET(){
 const {supabase,user}=await getSession();if(!user)return errorResponse(401,'unauthorized','Sign in to continue.');
 const {data,error}=await supabase.from('project_assets').select('id,prompt,provider,mime_type,created_at,project_id').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(30);
 if(error)return errorResponse(503,'storage_error','Image history could not be loaded.');
 return Response.json({images:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const {supabase,user}=await getSession();if(!user)return errorResponse(401,'unauthorized','Sign in to continue.');
 let body;try{body=await request.json();}catch{return errorResponse(400,'invalid_request','Enter an image description.');}
 const prompt=body?.prompt;const provider=body?.provider??imageProviders()[0]?.id;
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>4000)return errorResponse(400,'invalid_request','Use an image description between 1 and 4,000 characters.');
 if(!imageProviders().length)return errorResponse(503,'not_configured','No image connection is available right now.');
 const projectId=body.projectId??null;
 if(projectId){const p=isUuid(projectId)?await getProject(projectId):null;if(!p||p.role==='viewer')return errorResponse(403,'invalid_request','You cannot save images to this project.');}
 const limit=await consumeRequest(supabase,'build');if(!limit.allowed)return limitResponse(limit);if(limit.degraded)return errorResponse(503,'upstream_error','The usage check is temporarily unavailable.');
 const choices=imageProviders().sort((a,b)=>Number(b.id===provider)-Number(a.id===provider));
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(100000)]);
 let exhausted=false;
 for(const choice of choices){
 const provider=choice.id; const config=getProviderConfig(provider==='huggingface'?'huggingface':'cloudflare');
 if(!config||config.kind!=='openai-compatible')continue;
 try{
  const hf=provider==='huggingface';
  const url=hf?'https://router.huggingface.co/nscale/v1/images/generations':config.baseUrl.replace(/\/v1$/,'/run/@cf/black-forest-labs/flux-1-schnell');
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify(hf?{model:'black-forest-labs/FLUX.1-schnell',prompt:prompt.trim(),response_format:'b64_json',size:'512x512',n:1}:{prompt:prompt.trim(),steps:4}),signal:AbortSignal.any([signal,AbortSignal.timeout(choices.length>1?45000:95000)])});
  if([402,429].includes(response.status)){exhausted=true;continue;}
  if(!response.ok){console.warn('[images] provider failure',{provider,status:response.status});continue;}
  const data=JSON.parse(await boundedText(response,6000000));const b64=hf?data.data?.[0]?.b64_json:data.result?.image;
  if(typeof b64!=='string'||b64.length>5500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error('Invalid image');
  const mime=imageMime(b64);if(!mime)throw Error('Unsupported image format');
  const src=`data:${mime};base64,${b64}`;
  const saved=await supabase.from('project_assets').insert({owner_id:user.id,project_id:projectId,prompt:prompt.trim(),provider,mime_type:mime,data_url:src}).select('id,created_at').single();
  return Response.json({src,provider,id:saved.data?.id,mime,warning:saved.error?'Your image was generated but could not be saved. Download it now to keep a copy.':undefined},{headers:{'Cache-Control':'private, no-store'}});
 }catch{if(signal.aborted)break;}
 }
 return exhausted?errorResponse(429,'rate_limited','All connected free image allowances are busy or exhausted. Please retry after their reset.'):errorResponse(502,'network_error','The connected image providers could not finish this image. Please retry.');
}
