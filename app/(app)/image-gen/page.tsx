import {ImageStudio} from '@/components/images/image-studio';
import {imageProviders} from '@/lib/images/providers';
import {getSession} from '@/lib/auth/session';
export default async function ImageGenPage(){const {supabase,user}=await getSession();const [projects,members]=await Promise.all([supabase.from('projects').select('id,name,owner_id').is('deleted_at',null).order('updated_at',{ascending:false}).limit(100),supabase.from('project_members').select('project_id').eq('user_id',user!.id).eq('role','editor')]);const editorIds=new Set(members.data?.map(m=>m.project_id));return <ImageStudio providers={imageProviders()} projects={(projects.data??[]).filter(p=>p.owner_id===user?.id||editorIds.has(p.id)).map(p=>({id:p.id,name:p.name}))}/>;}
