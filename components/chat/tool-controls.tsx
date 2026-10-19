'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Plus,X} from 'lucide-react';
import {CHAT_TOOLS,naturalMediaTool,type ChatToolOptions} from '@/lib/chat/tools';
export function ToolControls({value,onChange,prompt,busy}:{value:ChatToolOptions;onChange:(value:ChatToolOptions)=>void;prompt:string;busy:boolean}){
 const [open,setOpen]=useState(false);
 const selected=CHAT_TOOLS.find(t=>t.id===value.tool);
 return <div className="relative px-3 pb-2">
  <div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="Add tools" aria-expanded={open} disabled={busy} className="flex size-8 items-center justify-center rounded-full border hover:bg-raised focus-visible:ring-2" onClick={()=>setOpen(!open)}><Plus size={17}/></button>
   {selected&&<span className="flex items-center gap-2 rounded-full border bg-raised px-3 py-1 text-xs">{selected.label}<button type="button" aria-label="Remove selected tool" disabled={busy} onClick={()=>onChange({})}><X size={12}/></button></span>}
  </div>
  {open&&<div className="absolute bottom-full left-3 z-30 mb-2 max-h-72 w-64 overflow-auto rounded-2xl border bg-background p-2 shadow-xl" aria-label="Tools">{CHAT_TOOLS.map(t=><button type="button" key={t.id} disabled={busy} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-raised focus-visible:ring-2" onClick={()=>{onChange({tool:t.id});setOpen(false);}}>{t.label}</button>)}<Link href="/plugins" className="mt-2 block rounded-xl border-t px-3 py-3 text-sm">Manage plugins</Link></div>}
  {(value.tool==='image'||!value.tool&&naturalMediaTool(prompt)==='image')&&<label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><input type="checkbox" checked={value.communityConsent===true} disabled={busy} onChange={e=>onChange({...value,communityConsent:e.target.checked})} className="mt-0.5"/>Allow AI Horde community processing for this request. Volunteers receive the prompt; anonymous images are shared for research. Do not include private information.</label>}
  {value.tool==='video'&&<select aria-label="Video aspect ratio" className="mt-2 rounded border bg-background p-1 text-xs" value={value.aspectRatio??'16:9'} disabled={busy} onChange={e=>onChange({...value,aspectRatio:e.target.value as '16:9'|'9:16'})}><option value="16:9">Landscape</option><option value="9:16">Portrait</option></select>}
 </div>;
}
