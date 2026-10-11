import {getSession} from '@/lib/auth/session';
import {isSameOrigin} from '@/lib/auth/same-origin';
import {consumeRequest} from '@/lib/limits/consume';
import {getDefaultModelFor} from '@/lib/data/account';
import {streamWithFallback} from '@/lib/ai/generate';
import {PLUGINS} from '@/lib/plugins/registry';
import {parseToolProposal} from '@/lib/plugins/planner';
import {PluginError,runPlugin} from '@/lib/plugins/server';
export const maxDuration=60;
export async function POST(request:Request){
 if(!isSameOrigin(request))return Response.json({error:'Reload this page.'},{status:403});
 const {user,supabase}=await getSession();if(!user)return Response.json({error:'Sign in to continue.'},{status:401});
 try{
 const body=await request.json();if(typeof body?.question!=='string'||body.question.length>2000||!body.question.trim())return Response.json({error:'Enter a question up to 2,000 characters.'},{status:400});
 const limit=await consumeRequest(supabase,'chat');if(!limit.allowed)return Response.json({error:limit.message},{status:429});if(limit.degraded)return Response.json({error:'Usage checks are temporarily unavailable.'},{status:503});
 let text='',complete=false,usedModel=await getDefaultModelFor(supabase,user.id);
 for await(const event of streamWithFallback({model:usedModel,systemInstruction:'Choose one public read tool. Output only JSON {"plugin":"id","input":"exact target"}. Target must occur verbatim in the user request. For email, private files, account access, writing, sending, purchase, deployment, or unsupported requests output {"unavailable":true}. Never claim an action was performed. Catalog: '+JSON.stringify(PLUGINS.map(p=>({plugin:p.id,description:p.description,input:p.inputLabel}))),turns:[{role:'user',content:body.question}],maxTokens:256,temperature:0,signal:AbortSignal.any([request.signal,AbortSignal.timeout(35000)])})){
 if(event.type==='text'){text+=event.text;if(text.length>2000)break;}else if(event.type==='fallback')usedModel=event.to;else if(event.type==='done')complete=true;else if(event.type==='error')return Response.json({error:'A connected free model could not choose a tool. Use the direct lookup below.'},{status:503});
 }
 const proposal=complete?parseToolProposal(text,body.question):null;if(!proposal)return Response.json({error:'No available public tool matches. Specify an exact domain or public owner/repository. Account integrations and write actions are not connected.'},{status:409});
 // API content remains data: do not feed it back as executable instructions.
 return Response.json({...await runPlugin(proposal.plugin,proposal.input,request.signal),model:usedModel},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return Response.json({error:e instanceof PluginError?e.message:'The tool request could not finish. No write action was performed.'},{status:e instanceof PluginError?e.status:502});}
}
