import {getSession} from '@/lib/auth/session';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {consumeRequest} from '@/lib/limits/consume';
import {PluginError,runPlugin} from '@/lib/plugins/server';
export async function POST(request:Request){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {user,supabase}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401});
 try{const text=await request.text();if(text.length>2000)throw new PluginError(400,'Request too large.');let body;try{body=JSON.parse(text);}catch{throw new PluginError(400,'Invalid request.');}if(typeof body?.plugin!=='string')throw new PluginError(400,'Choose an available integration.');
 const limit=await consumeRequest(supabase,'chat');if(!limit.allowed)throw new PluginError(429,limit.message);if(limit.degraded)throw new PluginError(503,'Usage checks are temporarily unavailable.');
 return Response.json(await runPlugin(body.plugin,body.input,request.signal),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof PluginError?error.message:'The lookup could not finish. Please retry.'},{status:error instanceof PluginError?error.status:502,headers:error instanceof PluginError&&error.retryAfter?{'Retry-After':error.retryAfter}:{}});}
}
