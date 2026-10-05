import {after} from 'next/server';
import {getSession} from '@/lib/auth/session';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {generateVideo,videoAvailable} from '@/lib/videos/provider';
import {consumeRequest} from '@/lib/limits/consume';
export const maxDuration=300;
export async function GET(){
 const {supabase,user}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401});
 // A process terminated by the host must not leave the UI thinking forever.
 await supabase.from('video_jobs').update({status:'failed',error:'The generation was interrupted. Please retry.'}).eq('owner_id',user.id).in('status',['queued','running']).lt('created_at',new Date(Date.now()-10*60*1000).toISOString());
 const {data,error}=await supabase.from('video_jobs').select('*').eq('owner_id',user.id).is('hidden_at',null).order('created_at',{ascending:false}).limit(30);
 if(error)return Response.json({error:'Video history could not load.'},{status:503});
 return Response.json({videos:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {supabase,user}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401});
 if(!videoAvailable())return Response.json({error:'Video generation is unavailable.'},{status:503});
 let body;try{body=await request.json();}catch{return Response.json({error:'Enter a video prompt.'},{status:400});}
 if(typeof body?.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000||!['16:9','9:16'].includes(body.aspectRatio))return Response.json({error:'Enter a prompt up to 4,000 characters and choose an aspect ratio.'},{status:400});
 const limit=await consumeRequest(supabase,'build');if(!limit.allowed||limit.degraded)return Response.json({error:'Video allowance is busy. Please retry later.'},{status:429});
 const active=await supabase.from('video_jobs').select('id').eq('owner_id',user.id).in('status',['queued','running']).limit(1);
 if(active.error)return Response.json({error:'Could not start a video.'},{status:503});
 if(active.data?.length)return Response.json({error:'A video is already being generated.'},{status:409});
 const {data:job,error}=await supabase.from('video_jobs').insert({owner_id:user.id,prompt:body.prompt.trim(),aspect_ratio:body.aspectRatio}).select('*').single();
 if(error||!job)return Response.json({error:'Could not save this generation.'},{status:503});
 after(async()=>{
  const started=await supabase.from('video_jobs').update({status:'running'}).eq('id',job.id).eq('status','queued').select('id').maybeSingle();if(!started.data)return;
  try{
   const result=await generateVideo(job.prompt,job.aspect_ratio,AbortSignal.timeout(270000));
   const state=await supabase.from('video_jobs').select('status').eq('id',job.id).single();if(state.data?.status!=='running')return;
   const path=user.id+'/'+job.id+'.mp4';const upload=await supabase.storage.from('generated-videos').upload(path,result.bytes,{contentType:'video/mp4',upsert:false});if(upload.error)throw Error('Storage failed');
   const saved=await supabase.from('video_jobs').update({status:'complete',storage_path:path,model:result.model}).eq('id',job.id).eq('status','running');if(saved.error)throw Error('Save failed');
  }catch(e){
   const status=typeof e==='object'&&e&&'httpResponse' in e?(e.httpResponse as {status?:number})?.status:undefined;
   console.warn('[videos] generation failed',{status:status??'generation-or-storage'});
   await supabase.from('video_jobs').update({status:'failed',error:[402,429].includes(status??0)?'The free video allowance is exhausted or busy. Please retry after it resets.':'The video provider could not finish this clip. Please retry.'}).eq('id',job.id).eq('status','running');
  }
 });
 return Response.json({job},{status:202,headers:{'Cache-Control':'no-store'}});
}
