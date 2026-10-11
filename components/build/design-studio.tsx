"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { assembleDocument, PREVIEW_SANDBOX } from "@/lib/build/assemble";
import { designDemo } from "@/lib/design/render";
import { compatibleStyles, DEFAULT_DESIGN, DESIGN_STYLES, getStyle, type DesignConfig, type StyleId } from "@/lib/design/registry";

export function DesignStudio({saved,busy,error,readOnly,onSave,onClose}:{saved:DesignConfig|null;busy:boolean;error:string|null;readOnly:boolean;onSave:(config:DesignConfig)=>Promise<boolean>;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState<DesignConfig>(()=>saved??{...DEFAULT_DESIGN});
  const [width,setWidth]=useState("1120");
  const primary=draft.styles[0]??"glass";
  const sample=useMemo(()=>assembleDocument(designDemo({...draft,styles:draft.styles.length?draft.styles:["glass"]})),[draft]);
  useEffect(()=>{dialog.current?.showModal();},[]);
  function choose(id:StyleId) {setDraft(d=>({...d,mode:"manual",styles:[id]}));}
  function pair(id:string) {setDraft(d=>({...d,mode:"manual",styles:id?[primary,id as StyleId]:[primary]}));}
  return <dialog ref={dialog} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} aria-labelledby="design-title" className="m-auto max-h-[94dvh] w-[min(1120px,96vw)] max-w-none overflow-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60">
    <header className="flex items-center justify-between gap-4 border-b p-5"><div><p className="text-[10px] uppercase tracking-[.2em] text-subtle">Project design</p><h2 id="design-title" className="text-xl font-medium">Design Studio</h2></div><button type="button" aria-label="Close Design Studio" disabled={busy} onClick={onClose} className="platform-button"><X size={18}/></button></header>
    <div className="grid md:grid-cols-[290px_1fr]">
      <section aria-label="Choose visual style" className="border-b p-4 md:max-h-[65dvh] md:overflow-auto md:border-r md:border-b-0">
        <button type="button" aria-pressed={draft.mode==="automatic"} onClick={()=>setDraft(d=>({...d,mode:"automatic",styles:[]}))} className="mb-3 w-full rounded-xl border p-3 text-left aria-pressed:border-foreground aria-pressed:bg-raised"><span className="block text-sm font-medium">Automatic</span><span className="text-xs text-subtle">Match the next prompt, then preserve its style.</span></button>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">{DESIGN_STYLES.map(style=><button type="button" key={style.id} onClick={()=>choose(style.id)} aria-pressed={draft.mode==="manual"&&primary===style.id} className="flex items-center gap-3 rounded-xl border p-2.5 text-left aria-pressed:border-foreground aria-pressed:bg-raised">
          <span aria-hidden="true" className="grid size-8 shrink-0 grid-cols-2 overflow-hidden rounded-lg border"><span style={{background:style.tokens.background}}/><span style={{background:style.tokens.accent}}/></span><span className="text-xs font-medium">{style.name}</span>
        </button>)}</div>
      </section>
      <section aria-label="Live design sample" className="min-w-0 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-medium">{draft.styles.length?draft.styles.map(id=>getStyle(id).name).join(" + "):"Automatic · glass sample"}</h3><p className="mt-1 text-xs text-subtle">{getStyle(primary).technology}</p></div><label className="text-xs">Preview width <select value={width} onChange={e=>setWidth(e.target.value)} className="ml-2 rounded border bg-background p-1.5"><option value="1120">Desktop</option><option value="768">Tablet</option><option value="375">Mobile</option></select></label></div>
        <DesignSample document={sample} width={Number(width)}/>
        <p className="mt-2 text-xs leading-relaxed text-subtle">{getStyle(primary).description} This is a rendered sample, not your project. No external libraries or API calls.</p>
        <fieldset disabled={busy||readOnly} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs">Complementary style<select value={draft.styles[1]??""} disabled={draft.mode==="automatic"} onChange={e=>pair(e.target.value)} className="mt-1 block w-full rounded-lg border bg-background p-2"><option value="">None</option>{DESIGN_STYLES.filter(s=>s.id!==primary&&compatibleStyles(primary,s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="text-xs">Motion intensity<select value={draft.motion} onChange={e=>setDraft(d=>({...d,motion:e.target.value as DesignConfig["motion"]}))} className="mt-1 block w-full rounded-lg border bg-background p-2">{["subtle","balanced","expressive","maximum"].map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</select></label>
          <label className="text-xs">Animation speed · {draft.speed}×<input className="mt-3 block w-full accent-current" type="range" min="0.5" max="2" step="0.25" value={draft.speed} onChange={e=>setDraft(d=>({...d,speed:Number(e.target.value)}))}/></label>
          {(draft.styles.includes("particle")||draft.styles.includes("halftone"))&&<label className="text-xs">Particle / dot density · {draft.density}<input className="mt-3 block w-full accent-current" type="range" min="12" max="64" step="1" value={draft.density} onChange={e=>setDraft(d=>({...d,density:Number(e.target.value)}))}/></label>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.reducedMotion} onChange={e=>setDraft(d=>({...d,reducedMotion:e.target.checked}))}/>Always reduce motion</label>
        </fieldset>
        <p className="mt-4 text-xs leading-relaxed text-subtle">Your device’s reduced-motion setting is always respected. Maximum stays bounded. Saving updates tokens and existing design components; the next Build request applies the full layout direction. Automatic selection uses prompt matching and stays consistent across edits.</p>
        {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </section>
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4"><span className="text-xs text-subtle">{readOnly?"Viewer access · preview only":"Saved to this project, including exported source."}</span><button type="button" className="platform-button" disabled={busy||readOnly} onClick={async()=>{if(await onSave(draft))onClose();}}>{busy?"Saving design…":"Save design"}</button></footer>
  </dialog>;
}

function DesignSample({document:html,width}:{document:string;width:number}){
  const box=useRef<HTMLDivElement>(null);
  const [available,setAvailable]=useState(600);
  useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(([entry])=>setAvailable(entry.contentRect.width));observer.observe(box.current);return()=>observer.disconnect();},[]);
  const scale=Math.min(1,available/width);
  return <div ref={box} className="relative h-[320px] overflow-hidden rounded-xl border bg-raised"><iframe title="Rendered style sample" srcDoc={html} sandbox={PREVIEW_SANDBOX} referrerPolicy="no-referrer" className="absolute left-0 top-0 origin-top-left border-0" style={{width,height:Math.ceil(320/Math.max(.1,scale)),transform:`scale(${scale})`}}/></div>;
}
