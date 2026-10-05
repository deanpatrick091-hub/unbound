'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useShell} from './shell-context';
import {PinButton} from '@/components/projects/pin-button';
import type {PinRow} from '@/lib/projects/types';
type Item=PinRow&{title:string;href:string;target:string};
export function SidebarPins({onNavigate}:{onNavigate?:()=>void}) {
 const {user}=useShell();const [items,setItems]=useState<Item[]>([]);
 useEffect(()=>{let active=true;let sequence=0;async function refresh(){const current=++sequence;const db=createClient();const {data:pins,error}=await db.from('pins').select('*').eq('user_id',user.id).order('created_at',{ascending:false});if(error)return;const projectIds=[...new Set((pins??[]).flatMap(p=>p.project_id?[p.project_id]:[]))];const chatIds=(pins??[]).flatMap(p=>p.conversation_id?[p.conversation_id]:[]);const [projects,chats]=await Promise.all([db.from('projects').select('id,name').in('id',projectIds).is('deleted_at',null),db.from('conversations').select('id,title').in('id',chatIds)]);if(projects.error||chats.error)return;const next=(pins??[]).flatMap(p=>{const target=p.project_id?projects.data?.find(x=>x.id===p.project_id):chats.data?.find(x=>x.id===p.conversation_id);return target?[{...p,title:'name' in target?target.name:target.title,href:p.project_id?'/build/'+p.project_id:'/c/'+p.conversation_id,target:target.id}]:[];});if(active&&sequence===current)setItems(next);}
 void refresh();window.addEventListener('unbound:pins-changed',refresh);return()=>{active=false;window.removeEventListener('unbound:pins-changed',refresh);};},[user.id]);
 if(!items.length)return null;
 return <details open className="shrink-0 px-2"><summary className="cursor-pointer px-2 py-2 text-[11px] uppercase tracking-wider text-subtle">Pinned</summary><ul className="max-h-44 space-y-px overflow-y-auto">{items.map(p=><li key={p.id} className="group flex items-center rounded-md px-2 hover:bg-surface"><Link onClick={onNavigate} className="min-w-0 flex-1 truncate py-2 text-sm focus-visible:ring-2" href={p.href}>{p.title}</Link><span className="sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"><PinButton compact id={p.target} kind={p.kind}/></span></li>)}</ul></details>;
}
