import {getSession} from '@/lib/auth/session';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {isUuid} from '@/lib/projects/server';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const {supabase,user}=await getSession();if(!user||!isUuid(id))return new Response(null,{status:404});
 const {data}=await supabase.from('video_jobs').select('storage_path,status').eq('id',id).maybeSingle();if(data?.status!=='complete'||!data.storage_path)return new Response(null,{status:404});
 const signed=await supabase.storage.from('generated-videos').createSignedUrl(data.storage_path,300,new URL(request.url).searchParams.has('download')?{download:'unbound-video.mp4'}:undefined);if(signed.error)return new Response(null,{status:503});
 return new Response(null,{status:302,headers:{Location:signed.data.signedUrl,'Cache-Control':'private, no-store'}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {id}=await params;const {supabase,user}=await getSession();if(!user||!isUuid(id))return Response.json({error:'Video not found.'},{status:404});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid request.'},{status:400});}
 const update=body.action==='cancel'?{status:'cancelled' as const}:body.action==='hide'?{hidden_at:new Date().toISOString()}:body.action==='save'&&isUuid(body.projectId)?{project_id:body.projectId}:null;
 if(!update)return Response.json({error:'Invalid action.'},{status:400});
 let query=supabase.from('video_jobs').update(update).eq('id',id).eq('owner_id',user.id);if(body.action==='cancel')query=query.in('status',['queued','running']);if(body.action==='save')query=query.eq('status','complete');
 const {data,error}=await query.select('id').maybeSingle();if(error)return Response.json({error:'Could not update this video. Check project permissions.'},{status:403});if(!data)return Response.json({error:'Video changed. Refresh and retry.'},{status:409});
 return Response.json({ok:true});
}
