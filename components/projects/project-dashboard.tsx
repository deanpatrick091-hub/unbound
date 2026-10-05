'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {useShell} from '@/components/shell/shell-context';
import {PinButton} from './pin-button';
import type {InviteRow,ProjectRow} from '@/lib/projects/types';
import type {Json} from '@/lib/supabase/database.types';
export function ProjectDashboard({initial,model}:{initial:ProjectRow[];model:string}){
 const {user}=useShell();const router=useRouter();const [projects,setProjects]=useState(initial);const [search,setSearch]=useState('');const [sort,setSort]=useState('recent');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [invites,setInvites]=useState<InviteRow[]>([]);
 useEffect(()=>{let live=true;createClient().from('project_invites').select('*').eq('invitee_id',user.id).eq('status','pending').gt('expires_at',new Date().toISOString()).then(r=>{if(live)setInvites(r.data??[]);});return()=>{live=false;};},[user.id]);
 async function create(source?:ProjectRow,legacy=false){setBusy(true);setError('');try{const db=createClient();let files:Json={};let conversation:Json=[];
 if(source){const r=await db.from('project_files').select('path,content').eq('project_id',source.id);if(r.error)throw r.error;files=Object.fromEntries((r.data??[]).map(f=>[f.path,f.content]));const original=await db.from('projects').select('conversation').eq('id',source.id).single();if(original.error)throw Error('Could not read the original conversation.');conversation=original.data.conversation;}
 if(legacy){const raw=localStorage.getItem('unbound:builder:'+user.id);if(!raw)throw Error('There is no older browser build to import.');const saved=JSON.parse(raw);files=saved.files??{};conversation=saved.messages??[];}
 const r=await db.from('projects').insert({owner_id:user.id,updated_by:user.id,model:source?.model??model,name:source?source.name+' copy':legacy?'Imported website':'Untitled website'}).select('*').single();if(r.error||!r.data)throw Error('Could not create project.');
 if(source||legacy){const saved=await db.rpc('save_project',{p_id:r.data.id,p_revision:0,p_files:files,p_conversation:conversation,p_model:r.data.model,p_settings:source?.settings??{},p_preview:source?.preview_state??{}});if(saved.error)throw Error('Project created, but the copy could not be saved. The original is unchanged.');}
 router.push('/build/'+r.data.id);
 }catch(e){setError(e instanceof Error?e.message:'Could not create project.');}finally{setBusy(false);}}
 async function edit(p:ProjectRow,remove=false){const name=remove?null:window.prompt('Project name',p.name);if(!remove&&!name?.trim())return;if(remove&&!window.confirm('Move this project to trash? You can restore it here.'))return;
 const r=await createClient().from('projects').update(remove?{deleted_at:new Date().toISOString(),updated_by:user.id}:{name:name!.trim().slice(0,120),updated_by:user.id}).eq('id',p.id).select('*').single();if(r.error)setError('Could not update project. Check your permissions.');else setProjects(rows=>rows.map(x=>x.id===p.id?r.data:x));}
 async function restore(p:ProjectRow){const r=await createClient().from('projects').update({deleted_at:null,updated_by:user.id}).eq('id',p.id).select('*').single();if(r.error)setError('Could not restore project.');else setProjects(rows=>rows.map(x=>x.id===p.id?r.data:x));}
 async function respond(i:InviteRow,accept:boolean){setBusy(true);const db=createClient();const r=accept?await db.rpc('accept_project_invite',{p_id:i.id}):await db.from('project_invites').update({status:'declined'}).eq('id',i.id);setBusy(false);if(r.error)setError('Invitation could not be processed. It may have expired.');else if(accept)router.push('/build/'+r.data);else setInvites(v=>v.filter(x=>x.id!==i.id));}
 const visible=projects.filter(p=>(sort==='trash'?!!p.deleted_at:!p.deleted_at)&&p.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):b.updated_at.localeCompare(a.updated_at));
 return <div className="overflow-y-auto p-5 sm:p-9"><div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-xl font-medium">Projects</h1></div><button className="platform-button" disabled={busy} onClick={()=>void create()}>Create project</button></header>

 {error&&<p role="alert" className="text-destructive">{error}</p>}
 {invites.map(i=><div key={i.id} className="platform-card flex flex-wrap gap-3"><span>Project invitation · {i.role}</span><button disabled={busy} onClick={()=>void respond(i,true)}>Accept invitation</button><button disabled={busy} onClick={()=>void respond(i,false)}>Decline</button></div>)}
 <div className="flex flex-wrap gap-3"><input className="platform-input flex-1" aria-label="Search projects" placeholder="Search projects" value={search} onChange={e=>setSearch(e.target.value)}/><select className="platform-input" aria-label="Sort projects" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently updated</option><option value="name">Name</option><option value="trash">Trash</option></select><button className="platform-button" disabled={busy} onClick={()=>void create(undefined,true)}>Import older browser build</button></div>
 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(p=><article key={p.id} className="min-w-0 overflow-hidden rounded-xl border bg-surface/30">
 <Link href={'/build/'+p.id} className="relative block aspect-[16/10] overflow-hidden border-b bg-background focus-visible:ring-2" aria-label={'Open '+p.name}>
 {p.revision>0?<iframe key={p.revision} title={p.name+' preview'} src={'/api/projects/'+p.id+'/thumbnail?v='+p.revision} sandbox="allow-scripts" loading="lazy" tabIndex={-1} aria-hidden="true" className="pointer-events-none h-[250%] w-[250%] origin-top-left scale-[.4] border-0"/>:<span className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-muted-foreground">Your preview appears after the first build.</span>}
 </Link>
 <div className="flex items-center gap-2 px-4 py-3"><Link className="min-w-0 flex-1 truncate text-sm font-medium" href={'/build/'+p.id}>{p.name}</Link>
 {p.deleted_at?<button className="platform-button" onClick={()=>void restore(p)}>Restore</button>:<details className="relative"><summary aria-label={'Actions for '+p.name} className="cursor-pointer list-none rounded px-2 py-1 text-lg focus-visible:ring-2">⋯</summary><div className="absolute bottom-full right-0 z-10 mb-1 flex min-w-40 flex-col gap-1 rounded-xl border bg-background p-2 shadow-lg"><Link className="platform-button" href={'/build/'+p.id}>Open</Link><PinButton id={p.id} kind="project"/><button className="platform-button" disabled={busy} onClick={()=>void create(p)}>Duplicate</button>{p.owner_id===user.id&&<><button className="platform-button" onClick={()=>void edit(p)}>Rename</button><button className="platform-button" onClick={()=>void edit(p,true)}>Delete</button></>}</div></details>}
 </div></article>)}</div>{!visible.length&&<p className="py-10 text-center text-muted-foreground">No projects here yet.</p>}
 </div></div>;
}
