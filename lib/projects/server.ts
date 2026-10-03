import 'server-only';
import { getSession } from '@/lib/auth/session';
import type { ProjectSnapshot } from './types';
import type { SiteFiles } from '@/lib/build/types';
export const isUuid=(id:unknown):id is string=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export async function getProject(id:string){
 const {supabase,user}=await getSession();
 if(!user||!isUuid(id))return null;
 const {data:p,error}=await supabase.from('projects').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
 if(error||!p)return null;
 const [{data:files,error:fileError},{data:member}]=await Promise.all([
  supabase.from('project_files').select('path,content').eq('project_id',id),
  supabase.from('project_members').select('role').eq('project_id',id).eq('user_id',user.id).maybeSingle()
 ]);
 if(fileError)return null;
 const role=p.owner_id===user.id?'owner':member?.role;
 if(!role)return null;
 return {...p,files:Object.fromEntries((files??[]).map(f=>[f.path,f.content])) as SiteFiles,conversation:Array.isArray(p.conversation)?p.conversation:[],role} as unknown as ProjectSnapshot;
}
