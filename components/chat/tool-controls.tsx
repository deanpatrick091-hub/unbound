'use client';
import {useState,useRef} from 'react';
import {parseAttachments,ATTACHMENT_LIMIT} from '@/lib/chat/attachments';
import Link from 'next/link';
import {Plus,X,Paperclip} from 'lucide-react';
import {CHAT_TOOLS,naturalMediaTool,type ChatToolOptions} from '@/lib/chat/tools';
export function ToolControls({value,onChange,prompt,busy,onReadingChange}:{value:ChatToolOptions;onChange:(value:ChatToolOptions)=>void;prompt:string;busy:boolean;onReadingChange:(reading:boolean)=>void}){
 const [open,setOpen]=useState(false);
 const [fileError,setFileError]=useState('');
 const [reading,setReading]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 const selected=CHAT_TOOLS.find(t=>t.id===value.tool);
 return <div className="relative px-3 pb-2" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
  <input ref={fileInput} type="file" multiple accept=".txt,.md,.csv,.json" className="hidden" aria-label="Attach text files" disabled={busy||reading} onChange={async e=>{
   const files=Array.from(e.target.files??[]);e.target.value='';setFileError('');setReading(true);onReadingChange(true);
   try{
    if(files.length+(value.attachments?.length??0)>3)throw Error('Attach up to three text files.');
    if(files.some(f=>f.size>ATTACHMENT_LIMIT))throw Error('Each file must be no larger than 40 KB.');
    const added=await Promise.all(files.map(async f=>({name:f.name,text:await f.text()})));
    onChange({...value,attachments:parseAttachments([...(value.attachments??[]),...added])});
   }catch(error){setFileError(error instanceof Error?error.message:'Could not read this file.');}
   finally{setReading(false);onReadingChange(false);}
  }}/>
  {reading&&<p role="status" className="mb-2 text-xs">Reading files…</p>}
  {fileError&&<p role="alert" className="mb-2 text-xs text-destructive">{fileError}</p>}
  {value.tool&&!!value.attachments?.length&&<p role="alert" className="mb-2 text-xs">Remove the selected tool to ask about attached files.</p>}
  {value.attachments?.map((file,index)=><span key={index} className="mb-2 mr-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">{file.name}<button type="button" disabled={busy||reading} aria-label={'Remove '+file.name} onClick={()=>onChange({...value,attachments:value.attachments?.filter((_,i)=>i!==index)})}><X size={12}/></button></span>)}
  <div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="Add tools" aria-expanded={open} disabled={busy} className="flex size-8 items-center justify-center rounded-full border hover:bg-raised focus-visible:ring-2" onClick={()=>setOpen(!open)}><Plus size={17}/></button>
   {selected&&<span className="flex items-center gap-2 rounded-full border bg-raised px-3 py-1 text-xs">{selected.label}<button type="button" aria-label="Remove selected tool" disabled={busy} onClick={()=>onChange({attachments:value.attachments})}><X size={12}/></button></span>}
  </div>
  {open&&<div className="absolute bottom-full left-3 z-30 mb-2 max-h-72 w-64 overflow-auto rounded-2xl border bg-background p-2 shadow-xl" aria-label="Tools"><button type="button" disabled={busy||reading} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-raised" onClick={()=>{fileInput.current?.click();setOpen(false);}}><Paperclip size={15}/>Attach text or CSV</button>{CHAT_TOOLS.map(t=><button type="button" key={t.id} disabled={busy} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-raised focus-visible:ring-2" onClick={()=>{onChange({tool:t.id,attachments:value.attachments});setOpen(false);}}>{t.label}</button>)}<Link href="/plugins" className="mt-2 block rounded-xl border-t px-3 py-3 text-sm">Manage plugins</Link></div>}
  {(value.tool==='image'||!value.tool&&naturalMediaTool(prompt)==='image')&&<label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><input type="checkbox" checked={value.communityConsent===true} disabled={busy} onChange={e=>onChange({...value,communityConsent:e.target.checked})} className="mt-0.5"/>Allow AI Horde community processing for this request. Volunteers receive the prompt; anonymous images are shared for research. Do not include private information.</label>}
  {value.tool==='video'&&<select aria-label="Video aspect ratio" className="mt-2 rounded border bg-background p-1 text-xs" value={value.aspectRatio??'16:9'} disabled={busy} onChange={e=>onChange({...value,aspectRatio:e.target.value as '16:9'|'9:16'})}><option value="16:9">Landscape</option><option value="9:16">Portrait</option></select>}
 </div>;
}
