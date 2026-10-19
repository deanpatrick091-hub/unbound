import 'server-only';
import {createImages} from '@/lib/images/handlers';
import {createVideos} from '@/lib/videos/handlers';
import {runPlugin,PluginError} from '@/lib/plugins/server';
import {runResearch} from '@/lib/integrations/research';
import {IntegrationError} from '@/lib/integrations/server';
import {githubSession,githubErrorResponse} from '@/lib/github/http';
import {credentials,currentConnection} from '@/lib/github/store';
import {runGitHubRead,operationSchema} from '@/lib/github/provider';
import {streamWithFallback} from '@/lib/ai/generate';
import {artifactText,type ChatToolOptions} from '@/lib/chat/tools';
function mediaRequest(request:Request,body:unknown){return new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body),signal:request.signal});}
function safeError(data:unknown){const d=data as {error?:string|{message?:string}};return typeof d?.error==='string'?d.error:d?.error?.message??'The tool could not complete this request.';}
/** One bounded operation. External content is never passed back to the tool planner. */
export async function executeChatTool(request:Request,prompt:string,options:ChatToolOptions,model:string):Promise<string>{
 if(options.tool==='image'||options.tool==='video'){
  const image=options.tool==='image';
  const response=await (image?createImages(mediaRequest(request,{prompt,communityConsent:options.communityConsent===true})):createVideos(mediaRequest(request,{prompt,aspectRatio:options.aspectRatio??'16:9'})));
  const data=await response.json();if(!response.ok)return safeError(data);
  if(image&&response.status===202)return 'Your image is queued. It will appear here when generation finishes.'+artifactText({kind:'image-job',id:data.jobId});
  if(image&&data.id)return 'Your image is saved to your image library.'+artifactText({kind:'image',id:data.id});
  if(image)return 'The image could not be saved. Open Image Gen to retry; no saved image is being claimed.';
  return 'Your video request is saved. Generation is in progress.'+artifactText({kind:'video',id:data.job.id});
 }
 try{
  if(options.tool&&['wikimedia','crossref','openalex','semantic','arxiv','jina','npm','openlibrary'].includes(options.tool)){
   const input=options.tool==='jina'?prompt.match(/https:\/\/[^\s]+/)?.[0]:prompt;
   if(!input)return 'Include a public HTTPS webpage URL.';
   const result=await runResearch(options.tool,input,request.signal);
   // Literal source data: no embedded images/HTML and no follow-up tool calls.
   return 'Read-only source results (external content):\n\n```text\n'+result.content.slice(0,24000).replace(/```/g,'~~~')+'\n```';
  }
  if(options.tool==='github'){
   const {db,userId}=await githubSession(request,true,true);
   const {row,value}=await credentials(db,userId,request.signal);
   let plan='';
   for await(const e of streamWithFallback({model,systemInstruction:'Translate the user request into ONE read-only GitHub JSON operation. Allowed: {"action":"repositories","query":""}; {"action":"file","owner":"...","repo":"...","path":"..."}; {"action":"issues","owner":"...","repo":"..."}; {"action":"issue","owner":"...","repo":"...","number":1}. Only identifiers explicitly supplied by the user. Return {"unsupported":true} for ambiguous requests or any writes. No prose.',turns:[{role:'user',content:prompt}],signal:request.signal,maxTokens:500})){if(e.type==='text')plan+=e.text;}
   let parsed;try{parsed=operationSchema.safeParse(JSON.parse(plan.replace(/^```(?:json)?\s*|\s*```$/g,'')));}catch{return 'Specify a repository and a read-only task, such as “list issues in owner/repository”.';}
   if(!parsed.success)return 'GitHub supports reading repositories, files and issues here. Write actions are not enabled.';
   const op=parsed.data;
   if('owner'in op&&(!prompt.toLowerCase().includes((op.owner+'/'+op.repo).toLowerCase())||('path'in op&&!prompt.includes(op.path))))return 'Include the exact owner/repository and file path in your message.';
   if(op.action==='issue'&&!new RegExp('\\b'+op.number+'\\b').test(prompt))return 'Include the issue number in your message.';
   if(op.action==='repositories'&&op.query&&!prompt.includes(op.query))op.query='';
   const authorized=()=>currentConnection(db,userId,row.connection_id);
   const result=await runGitHubRead(value,op,authorized,request.signal);
   if(!await authorized())return 'GitHub was disconnected during the request. No result is displayed.';
   return 'GitHub read-only result (external content):\n\n```json\n'+JSON.stringify(result,null,2).slice(0,24000).replace(/```/g,'~~~')+'\n```';
  }
  if(options.tool==='github-public'||options.tool==='vercel-domains'){
   const target=options.tool==='github-public'?prompt.match(/\b[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\b/)?.[0]:prompt.match(/\b[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+\b/)?.[0];
   if(!target)return 'Include '+(options.tool==='github-public'?'an owner/repository':'a domain name')+' in your message.';
   const result=await runPlugin(options.tool,target,request.signal);
   return 'Read-only lookup result. No account changes were made.\n\n```json\n'+JSON.stringify(result,null,2).slice(0,24000).replace(/```/g,'~~~')+'\n```';
  }
 }catch(e){if(options.tool==='github')return safeError(await githubErrorResponse(e).json());return e instanceof PluginError||e instanceof IntegrationError?e.message:'The tool is temporarily unavailable. No action was completed.';}
 return 'Choose a supported tool from the + menu.';
}
