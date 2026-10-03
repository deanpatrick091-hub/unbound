import {getSession} from '@/lib/auth/session';
import {getDefaultModelFor} from '@/lib/data/account';
import {ProjectDashboard} from '@/components/projects/project-dashboard';
export default async function BuildPage(){const {supabase,user}=await getSession();if(!user)throw Error('Workspace session unavailable.');const [{data,error},model]=await Promise.all([supabase.from('projects').select('*').order('updated_at',{ascending:false}).limit(200),getDefaultModelFor(supabase,user.id)]);if(error)throw Error('Projects could not be loaded. Please retry.');return <ProjectDashboard initial={data??[]} model={model}/>;}
