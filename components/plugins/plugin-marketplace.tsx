'use client';
import {useState} from 'react';
import {ArrowLeft, Code, Search, Globe, BookOpen} from 'lucide-react';
import {PLUGINS} from '@/lib/plugins/registry';
import type {Integration} from '@/lib/integrations/catalog';
import {GitHubIntegration} from '@/components/github/github-integration';
import {ToolWorkspace} from '@/components/integrations/tool-workspace';
import {PluginTool} from './plugin-tool';
type Tool = Integration & {status:string;checkedAt:string|null};
export function PluginMarketplace({tools=[],initialApp}:{tools?:Tool[];initialApp?:string}) {
 const [query,setQuery]=useState('');const [category,setCategory]=useState('All');const [selected,setSelected]=useState<string|undefined>(initialApp);
 const cards=[
  {id:'github',name:'GitHub',category:'Coding',description:'Connect your account to read repositories, files and issues.',action:'Connect or manage',kind:'account'},
  ...PLUGINS.map(p=>({id:p.id,name:p.name,category:p.category==='coding'?'Coding':'Web',description:p.description,action:'Open tool',kind:'public'})),
  ...tools.map(p=>({id:p.id,name:p.name,category:p.kind==='reader'?'Web':'Research',description:p.model,action:p.status==='CONFIGURATION REQUIRED'?'View setup':'Open tool',kind:'research'})),
 ];
 const current=cards.find(p=>p.id===selected);const tool=tools.find(p=>p.id===selected);const publicTool=PLUGINS.find(p=>p.id===selected);
 if(current)return <main className="flex-1 overflow-auto p-5 sm:p-8"><div className="mx-auto max-w-5xl"><button className="platform-button mb-6" onClick={()=>setSelected(undefined)}><ArrowLeft size={16}/>All apps</button>
  {selected==='github'?<GitHubIntegration/>:tool?<><h1 className="text-2xl font-medium">{tool.name}</h1><p className="mt-3 text-sm text-muted-foreground">{tool.allowance}</p>{tool.status==='CONFIGURATION REQUIRED'?<div className="mt-6 rounded-2xl border p-6"><h2 className="font-medium">Owner setup required</h2><p className="mt-2 text-sm">This tool needs a server-side credential and a verified free account. It is not connected.</p><p className="mt-3 text-sm">Required setting: <code>{tool.env}</code></p><a className="platform-button mt-4" href={tool.docs} target="_blank" rel="noopener noreferrer">Official setup instructions</a></div>:<ToolWorkspace initial={[tool]}/>}</>:publicTool?<><h1 className="text-2xl font-medium">{publicTool.name}</h1><p className="mt-3 text-sm text-muted-foreground">{publicTool.description}</p><p className="mt-3 text-xs text-muted-foreground">{publicTool.limits}</p><p className="mt-2 text-xs text-muted-foreground">{publicTool.permissions}</p><PluginTool id={publicTool.id} label={publicTool.inputLabel}/></>:null}
 </div></main>;
 const visible=cards.filter(p=>(category==='All'||p.category===category)&&(p.name+' '+p.description).toLowerCase().includes(query.toLowerCase()));
 return <main className="flex-1 overflow-auto p-5 sm:p-8"><div className="mx-auto max-w-5xl">
  <h1 className="text-3xl font-semibold tracking-tight">Apps</h1><p className="mt-2 text-sm text-muted-foreground">Your tools, together in Unbound.</p>
  <label className="mt-7 flex items-center gap-3 rounded-full border bg-surface/40 px-5 py-3"><Search size={18} className="text-muted-foreground"/><input aria-label="Search apps" className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search apps" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="my-5 flex flex-wrap gap-2" aria-label="App categories">{['All','Coding','Web','Research'].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)} className={'rounded-full border px-4 py-2 text-sm transition-colors '+(category===c?'bg-foreground text-background':'border-transparent hover:bg-surface')}>{c}</button>)}</div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map(p=><button key={p.id} onClick={()=>setSelected(p.id)} className="group flex min-h-48 flex-col rounded-2xl border bg-surface/20 p-5 text-left transition-colors hover:bg-surface/70 focus-visible:outline-2 focus-visible:outline-offset-2"><span className="mb-4 flex size-10 items-center justify-center rounded-xl border bg-background">{p.category==='Coding'?<Code size={21}/>:p.category==='Research'?<BookOpen size={21}/>:<Globe size={21}/>}</span><span className="font-medium">{p.name}</span><span className="mt-2 text-sm text-muted-foreground">{p.description}</span><span className="mt-auto pt-5 text-xs text-muted-foreground">{p.kind==='account'?'Account authorization required':'No personal login required'} · {p.action}</span></button>)}</div>
  {!visible.length&&<p className="py-12 text-center text-sm text-muted-foreground">No matching apps.</p>}
  <details className="mt-8 border-t pt-5 text-sm"><summary className="cursor-pointer text-muted-foreground">About account connections</summary><p className="mt-3 text-muted-foreground">GitHub supports personal account authorization. Slack, Google apps, Discord and other account integrations are not implemented yet. Connecting them in ChatGPT or Vercel does not automatically connect them to Unbound.</p></details>
  <details className="mt-5 text-sm"><summary className="cursor-pointer text-muted-foreground">Ask the public tools</summary><PluginTool id="assistant" label="Check example.com or inspect vercel/next.js"/></details>
 </div></main>;
}
