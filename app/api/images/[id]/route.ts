import {getSession} from '@/lib/auth/session';
import {isUuid} from '@/lib/projects/server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const {supabase,user}=await getSession();if(!user||!isUuid(id))return new Response(null,{status:404});
 const {data}=await supabase.from('project_assets').select('data_url,mime_type').eq('id',id).maybeSingle();if(!data)return new Response(null,{status:404});
 return new Response(Buffer.from(data.data_url.split(',')[1],'base64'),{headers:{'Content-Type':data.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
