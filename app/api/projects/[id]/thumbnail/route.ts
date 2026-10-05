import {getProject} from '@/lib/projects/server';
import {assembleDocument} from '@/lib/build/assemble';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const project=await getProject((await params).id);
 if(!project)return new Response(null,{status:404});
 if(!project.files['index.html'])return new Response('Preview appears after your first build.',{headers:{'Content-Type':'text/plain'}});
 return new Response(assembleDocument(project.files),{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':'sandbox allow-scripts','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
