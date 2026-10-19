'use client';
/* eslint-disable @next/next/no-img-element -- authenticated local image endpoints */
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {MediaArtifact as Artifact} from '@/lib/chat/tools';
export function MediaArtifact({artifact}:{artifact:Artifact}){
 const [state,setState]=useState(artifact.kind==='image'?'complete':'pending');
 const [message,setMessage]=useState('Checking saved generation…');const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(artifact.kind==='image')return;
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;let failures=0;
  async function poll(){
   let delay=10000;
   try{
    const image=artifact.kind==='image-job';
    const r=await fetch(image?'/api/images/jobs/'+artifact.id:'/api/videos',{method:image?'POST':'GET',signal:abort.signal,cache:'no-store'});const data=await r.json();
    if(!r.ok){
     if(r.status===429){const raw=Number(r.headers.get('retry-after'));delay=Number.isFinite(raw)&&raw>0?Math.min(raw,3600)*1000:60000;setMessage('Rate limited. Waiting before checking again…');}
     else if([401,403,404,409,410,422].includes(r.status)){setState('failed');setMessage(typeof data.error==='string'?data.error:'Generation is unavailable.');return;}
     else throw Error();
    }else{
     failures=0;const job=image?data:(data.videos??[]).find((v:{id:string})=>v.id===artifact.id);
     if(!job){setState('failed');setMessage('This video is not in your recent library.');return;}
     const status=image?job.state:job.status;
     if(status==='complete'){setState('complete');return;}
     if(['failed','cancelled'].includes(status)){setState('failed');setMessage(job.error??'Generation stopped.');return;}
     setMessage(image?'Queued with AI Horde. You can return to this chat.':'Creating your video. You can return to this chat.');
    }
   }catch{if(abort.signal.aborted)return;if(++failures>=4){setState('failed');setMessage('Could not check this generation. Your request is still saved.');return;}setMessage('Connection interrupted. Checking again shortly…');delay=20000;}
   if(!abort.signal.aborted)timer=setTimeout(()=>void poll(),delay);
  }
  void poll();return()=>{abort.abort();clearTimeout(timer);};
 },[artifact.id,artifact.kind,attempt]);
 const image=artifact.kind!=='video';const src=(image?'/api/images/':'/api/videos/')+artifact.id;
 return <section className="mt-4 overflow-hidden rounded-2xl border bg-surface/40 p-3" aria-label={image?'Generated image':'Generated video'}>
  {state==='complete'?<>{image?<img src={src} alt="Generated image" loading="lazy" className="max-h-[65vh] w-full rounded-xl object-contain" onError={()=>{setState('failed');setMessage('The saved image could not load.');}}/>:<video src={src} controls playsInline preload="metadata" className="max-h-[65vh] w-full rounded-xl bg-black" onError={()=>{setState('failed');setMessage('The saved video could not load.');}}/>}<div className="mt-3 flex flex-wrap gap-3 text-sm"><a className="platform-button" href={image?src:src+'?download=1'} download={image?'unbound-image':undefined}>Download</a><Link className="platform-button" href={image?'/image-gen':'/video-gen'}>Open library / save to project</Link></div></>:<><p role="status" className="py-4 text-sm text-muted-foreground">{message}</p>{state==='failed'&&<button type="button" className="platform-button" onClick={()=>{setState(artifact.kind==='image'?'complete':'pending');setAttempt(n=>n+1);}}>Check again</button>}<Link className="ml-3 text-xs underline" href={image?'/image-gen':'/video-gen'}>Manage generation</Link></>}
 </section>;
}
