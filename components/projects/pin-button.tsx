'use client';
import {useEffect,useState} from 'react';
import {Pin} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
import {useShell} from '@/components/shell/shell-context';
import type {PinRow} from '@/lib/projects/types';
let cached:Promise<PinRow[]>|undefined;let cacheUser='';
export function PinButton({kind,id,compact=false}:{kind:PinRow['kind'];id:string;compact?:boolean}){
 const {user}=useShell();const [pin,setPin]=useState<PinRow>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let live=true;function refresh(){const db=createClient();if(cacheUser!==user.id){cacheUser=user.id;cached=undefined;}
 cached??=Promise.resolve(db.from('pins').select('*').eq('user_id',user.id)).then(r=>{if(r.error){cached=undefined;throw r.error;}return r.data??[];});
 cached.then(rows=>{if(live)setPin(rows.find(p=>p.kind===kind&&(p.conversation_id??p.project_id)===id));}).catch(()=>{if(live)setError('Could not load pins.');});}
 refresh();window.addEventListener('unbound:pins-changed',refresh);return()=>{live=false;window.removeEventListener('unbound:pins-changed',refresh);};},[id,kind,user.id]);
 async function toggle(){setBusy(true);setError('');const db=createClient();const r=pin?await db.from('pins').delete().eq('id',pin.id):await db.from('pins').insert({user_id:user.id,kind,...(kind==='chat'?{conversation_id:id}:{project_id:id})}).select('*').single();
 if(r.error)setError('Could not update pin. Please retry.');else{setPin(pin?undefined:r.data as PinRow);cached=undefined;window.dispatchEvent(new Event('unbound:pins-changed'));}setBusy(false);}
 return <span><button type="button" className={compact?'flex size-7 items-center justify-center rounded hover:bg-raised focus-visible:ring-2':'platform-button'} aria-label={`${pin?'Unpin':'Pin'} ${kind}`} onClick={()=>void toggle()} disabled={busy} aria-pressed={!!pin} title={error||`${pin?'Unpin':'Pin'} ${kind}`}><Pin size={14} fill={pin?'currentColor':'none'}/>{!compact&&<span>{pin?'Pinned':'Pin'} {kind}</span>}</button>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</span>;
}
