import 'server-only';
import {boundedText} from '@/lib/integrations/server';
/** Workflow is installed and reviewed by the owner, never supplied by users or the model. */
export function comfyConfig(){
 if(process.env.COMFYUI_VIDEO_ENABLED!=='true'||process.env.COMFYUI_VIDEO_VERIFIED!=='true')return null;
 try{
  const url=new URL(process.env.COMFYUI_VIDEO_URL??'');const key=process.env.COMFYUI_VIDEO_API_KEY?.trim();
  const workflow=JSON.parse(process.env.COMFYUI_VIDEO_WORKFLOW??'null');
  const promptNode=process.env.COMFYUI_VIDEO_PROMPT_NODE??'',outputNode=process.env.COMFYUI_VIDEO_OUTPUT_NODE??'';
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!key||key.length<32||!workflow?.[promptNode]?.inputs||typeof workflow[promptNode].inputs.text!=='string'||!workflow?.[outputNode])return null;
  return {url:url.origin,key,workflow,promptNode,outputNode};
 }catch{return null;}
}
async function call(path:string,signal:AbortSignal,body?:unknown){
 const config=comfyConfig();if(!config)throw Object.assign(Error('Not configured'),{httpResponse:{status:503}});
 const response=await fetch(config.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
 if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Video worker request failed'),{httpResponse:{status:response.status}});}
 return response;
}
export async function generateComfyVideo(prompt:string,signal:AbortSignal){
 const config=comfyConfig();if(!config)throw Error('Video worker unavailable');
 const workflow=structuredClone(config.workflow);workflow[config.promptNode].inputs.text=prompt;
 const submitted=JSON.parse(await boundedText(await call('/prompt',signal,{prompt:workflow}),100000));const id=submitted.prompt_id;
 if(typeof id!=='string'||! /^[a-f0-9-]{36}$/i.test(id)||submitted.error)throw Object.assign(Error('Workflow rejected'),{httpResponse:{status:422}});
 try{
  while(!signal.aborted){
   await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},3000);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});
   const history=JSON.parse(await boundedText(await call('/history/'+id,signal),1000000))[id];
   if(history?.status?.status_str==='error')throw Object.assign(Error('Workflow failed'),{httpResponse:{status:422}});
   if(!history?.status?.completed)continue;
   const output=history.outputs?.[config.outputNode];
   const file=[...(output?.videos??[]),...(output?.gifs??[]),...(output?.images??[])].find((v:{filename?:string})=>typeof v.filename==='string'&&v.filename.endsWith('.mp4'));
   if(!file||! /^[a-zA-Z0-9_. -]+\.mp4$/.test(file.filename)||file.filename.includes('..')||typeof file.subfolder!=='string'||!/^[a-zA-Z0-9_/-]*$/.test(file.subfolder)||file.subfolder.split('/').includes('..')||file.type!=='output')throw Error('No valid MP4 output');
   const response=await call('/view?'+new URLSearchParams({filename:file.filename,subfolder:file.subfolder,type:'output'}),signal);
   const reader=response.body?.getReader();if(!reader)throw Error('No video');const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24*1024*1024){await reader.cancel();throw Error('Video too large');}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=Buffer.concat(chunks);if(bytes.length<16||bytes.subarray(4,8).toString()!=='ftyp')throw Error('Invalid MP4');
   return {bytes,model:'Self-hosted ComfyUI workflow'};
  }
  throw signal.reason;
 }finally{
  // Remove this pending job only; never interrupt another user's running workflow.
  try{await call('/queue',AbortSignal.timeout(5000),{delete:[id]});}catch{/* Do not log private payloads. */}
 }
}
