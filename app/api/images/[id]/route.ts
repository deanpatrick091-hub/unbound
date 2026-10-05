import {isSameOrigin} from '@/lib/auth/same-origin';
import {getSession} from '@/lib/auth/session';
import {getProject,isUuid} from '@/lib/projects/server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const {supabase,user}=await getSession();if(!user||!isUuid(id))return new Response(null,{status:404});
 const {data}=await supabase.from('project_assets').select('data_url,mime_type').eq('id',id).maybeSingle();if(!data)return new Response(null,{status:404});
 return new Response(Buffer.from(data.data_url.split(',')[1],'base64'),{headers:{'Content-Type':data.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {id}=await params;const {supabase,user}=await getSession();
 if(!user||!isUuid(id))return Response.json({error:'Image not found.'},{status:404});
 const {data,error}=await supabase.from('project_assets').update({history_deleted_at:new Date().toISOString()}).eq('id',id).eq('owner_id',user.id).select('id').maybeSingle();
 if(error)return Response.json({error:'Could not remove this image. Please retry.'},{status:503});
 if(!data)return Response.json({error:'Image not found.'},{status:404});
 return Response.json({ok:true,assetRetained:true},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {id}=await params;const {supabase,user}=await getSession();if(!user||!isUuid(id))return Response.json({error:'Image not found.'},{status:404});
 let body;try{body=await request.json();}catch{return Response.json({error:'Choose a project.'},{status:400});}
 const project=isUuid(body?.projectId)?await getProject(body.projectId):null;if(!project||project.role==='viewer')return Response.json({error:'You cannot save to this project.'},{status:403});
 const {data}=await supabase.from('project_assets').select('*').eq('id',id).eq('owner_id',user.id).maybeSingle();if(!data)return Response.json({error:'Image not found.'},{status:404});
 if(data.project_id===project.id)return Response.json({ok:true});
 const saved=await supabase.from('project_assets').insert({owner_id:user.id,project_id:project.id,prompt:data.prompt,provider:data.provider,mime_type:data.mime_type,data_url:data.data_url,history_deleted_at:new Date().toISOString()});
 return saved.error?Response.json({error:'Could not save this image.'},{status:503}):Response.json({ok:true});
}
