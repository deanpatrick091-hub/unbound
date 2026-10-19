import {comfyConfig} from '@/lib/videos/comfy';
import 'server-only';
import {videoFailure,videoQuotaBlocked,VIDEO_QUOTA_MESSAGE} from '@/lib/videos/errors';
import {after} from 'next/server';
import {getSession} from '@/lib/auth/session';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {generateVideo,videoAvailable} from '@/lib/videos/provider';
import {consumeRequest} from '@/lib/limits/consume';

export async function listVideos(){
 const {supabase,user}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401});
 // A process terminated by the host must not leave the UI thinking forever.
 await supabase.from('video_jobs').update({status:'failed',error:'The generation was interrupted. Please retry.'}).eq('owner_id',user.id).in('status',['queued','running']).lt('created_at',new Date(Date.now()-10*60*1000).toISOString());
 const {data,error}=await supabase.from('video_jobs').select('*').eq('owner_id',user.id).is('hidden_at',null).order('created_at',{ascending:false}).limit(30);
 if(error)return Response.json({error:'Video history could not load.'},{status:503});
 return Response.json({videos:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function createVideos(request:Request){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {supabase,user}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401});
 if(!videoAvailable())return Response.json({error:'Video generation is unavailable.'},{status:503});
 let body;try{body=await request.json();}catch{return Response.json({error:'Enter a video prompt.'},{status:400});}
 if(typeof body?.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000||!['16:9','9:16'].includes(body.aspectRatio))return Response.json({error:'Enter a prompt up to 4,000 characters and choose an aspect ratio.'},{status:400});
 if(comfyConfig()&&body.aspectRatio!=='16:9')return Response.json({error:'The configured self-hosted workflow supports landscape video only.'},{status:400});
 const previous=await supabase.from('video_jobs').select('error,created_at').eq('owner_id',user.id).eq('error',VIDEO_QUOTA_MESSAGE).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(previous.error)return Response.json({error:'Video status could not be checked. Please retry later.'},{status:503});
 if(!comfyConfig()&&videoQuotaBlocked(previous.data,process.env.VIDEO_QUOTA_RESET_AT))return Response.json({error:VIDEO_QUOTA_MESSAGE},{status:402});
 const limit=await consumeRequest(supabase,'build');if(!limit.allowed)return Response.json({error:limit.message},{status:429,headers:limit.retryAfterSeconds?{'Retry-After':String(limit.retryAfterSeconds)}:{}});
 if(limit.degraded)return Response.json({error:'The usage check is temporarily unavailable. Please retry later.'},{status:503});
 const active=await supabase.from('video_jobs').select('id').eq('owner_id',user.id).in('status',['queued','running']).limit(1);
 if(active.error)return Response.json({error:'Could not start a video.'},{status:503});
 if(active.data?.length)return Response.json({error:'A video is already being generated.'},{status:409});
 const {data:job,error}=await supabase.from('video_jobs').insert({owner_id:user.id,prompt:body.prompt.trim(),aspect_ratio:body.aspectRatio,provider:comfyConfig()?'comfyui':'huggingface'}).select('*').single();
 if(error?.code==='23505')return Response.json({error:'A video is already being generated.'},{status:409});
 if(error||!job)return Response.json({error:'Could not save this generation.'},{status:503});
 after(async()=>{
  const started=await supabase.from('video_jobs').update({status:'running'}).eq('id',job.id).eq('status','queued').select('id').maybeSingle();if(!started.data)return;
  try{
   const result=await generateVideo(job.prompt,job.aspect_ratio,AbortSignal.timeout(270000));
   const state=await supabase.from('video_jobs').select('status').eq('id',job.id).single();if(state.data?.status!=='running')return;
   const path=user.id+'/'+job.id+'.mp4';const upload=await supabase.storage.from('generated-videos').upload(path,result.bytes,{contentType:'video/mp4',upsert:false});if(upload.error)throw Object.assign(Error('Storage failed'),{videoCode:'storage'});
   const saved=await supabase.from('video_jobs').update({status:'complete',storage_path:path,model:result.model}).eq('id',job.id).eq('status','running');if(saved.error)throw Object.assign(Error('Save failed'),{videoCode:'storage'});
  }catch(e){
   const failure=videoFailure(e);
   console.warn('[videos] generation failed',{code:failure.code,status:failure.status??null});
   await supabase.from('video_jobs').update({status:'failed',error:failure.message}).eq('id',job.id).eq('status','running');
  }
 });
 return Response.json({job},{status:202,headers:{'Cache-Control':'no-store'}});
}
