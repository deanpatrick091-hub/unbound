import {getSession} from '@/lib/auth/session';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {isUuid} from '@/lib/projects/server';
import {checkCommunity,cancelCommunity} from '@/lib/images/community';
const headers={'Cache-Control':'private, no-store'};
export const maxDuration=60;
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403,headers});
 const {supabase,user}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401,headers});
 const {id}=await params;if(!isUuid(id))return Response.json({error:'Invalid job.'},{status:400,headers});
 const found=await supabase.from('integration_jobs').select('*').eq('id',id).eq('user_id',user.id).eq('provider','aihorde').maybeSingle();
 if(found.error)return Response.json({error:'Image job storage unavailable.'},{status:503,headers});
 if(!found.data)return Response.json({error:'Image job not found.'},{status:404,headers});
 if(!found.data.result){
  await cancelCommunity(found.data.remote_id);
  const changed=await supabase.from('integration_jobs').update({result:{state:'cancelled'}}).eq('id',id).eq('user_id',user.id);
  if(changed.error)return Response.json({error:'Could not stop tracking this image. Please retry.'},{status:503,headers});
 }
 return Response.json({state:'cancelled'},{headers});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403,headers});
 const {supabase,user}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401,headers});
 const {id}=await params;if(!isUuid(id))return Response.json({error:'Invalid job.'},{status:400,headers});
 const found=await supabase.from('integration_jobs').select('*').eq('id',id).eq('user_id',user.id).eq('provider','aihorde').maybeSingle();
 if(found.error)return Response.json({error:'Image job storage unavailable.'},{status:503,headers});
 const job=found.data;if(!job||!isUuid(job.remote_id))return Response.json({error:'Image job not found.'},{status:404,headers});
 const saved=await supabase.from('project_assets').select('id,mime_type').eq('id',id).eq('owner_id',user.id).maybeSingle();
 if(saved.error)return Response.json({error:'Image storage unavailable.'},{status:503,headers});
 if(saved.data)return Response.json({state:'complete',id,src:'/api/images/'+id,mime:saved.data.mime_type,provider:'aihorde'},{headers});
 if(job.result)return Response.json({error:'This image request ended. Start a new generation.'},{status:409,headers});
 if(Date.now()-Date.parse(job.created_at)>1800000){await cancelCommunity(job.remote_id);await supabase.from('integration_jobs').update({result:{state:'expired'}}).eq('id',id).eq('user_id',user.id);return Response.json({error:'The community queue timed out. Try again later.'},{status:410,headers});}
 try{
  const result=await checkCommunity(job.remote_id,request.signal);
  if(result.status===202)return Response.json({state:'queued',queue:result.queue},{status:202,headers});
  if(result.status===429)return Response.json({error:'Rate limited. Waiting before checking again.'},{status:429,headers:{...headers,'Retry-After':result.retryAfter??'60'}});
  if(result.status!==200||!result.value){
   if([404,410,422].includes(result.status))await supabase.from('integration_jobs').update({result:{state:'failed'}}).eq('id',id).eq('user_id',user.id);
   return Response.json({error:result.status===422?'The provider did not return an uncensored image. Try another prompt.':'Community image generation is temporarily unavailable.'},{status:[404,410,422].includes(result.status)?result.status:503,headers});
  }
  const {src,mime}=result.value;
  const insert=await supabase.from('project_assets').insert({id,owner_id:user.id,prompt:job.input,provider:'aihorde',mime_type:mime,data_url:src}).select('id').single();
  if(insert.error&&insert.error.code!=='23505')return Response.json({error:'Generated image could not be saved. Please check again.'},{status:503,headers});
  await supabase.from('integration_jobs').update({result:{assetId:id,model:result.model??'AI Horde'}}).eq('id',id).eq('user_id',user.id);
  return Response.json({state:'complete',id,src:'/api/images/'+id,mime,provider:'aihorde'},{headers});
 }catch{return Response.json({error:'Community image generation is temporarily unavailable.'},{status:503,headers});}
}
