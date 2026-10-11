import {getProject} from '@/lib/projects/server';
import {sourceArchive} from '@/lib/deploy/export';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const project=await getProject(id);if(!project)return new Response(null,{status:404});
 if(!project.files['index.html']?.trim())return Response.json({error:'Build and save a website before exporting.'},{status:409});
 return new Response(sourceArchive(project.files) as BodyInit,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="unbound-${project.id}-v${project.revision}.zip"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
