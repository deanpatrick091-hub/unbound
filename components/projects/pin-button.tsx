'use client';
import {useEffect,useState} from 'react';
import {Pin} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
import {useShell} from '@/components/shell/shell-context';
import type {PinRow} from '@/lib/projects/types';
let cached:Promise<PinRow[]>|undefined;let cacheUser='';
export function PinButton({kind,id}:{kind:PinRow['kind'];id:string}){
 const {user}=useShell();const [pin,setPin]=useState<PinRow>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let live=true;const db=createClient();if(cacheUser!==user.id){cacheUser=user.id;cached=undefined;}
 cached??=Promise.resolve(db.from('pins').select('*').eq('user_id',user.id)).then(r=>{if(r.error){cached=undefined;throw r.error;}return r.data??[];});
 cached.then(rows=>{if(live)setPin(rows.find(p=>p.kind===kind&&(p.conversation_id??p.project_id)===id));}).catch(()=>{if(live)setError('Could not load pins.');});return()=>{live=false;};},[id,kind,user.id]);
 async function toggle(){setBusy(true);setError('');const db=createClient();const r=pin?await db.from('pins').delete().eq('id',pin.id):await db.from('pins').insert({user_id:user.id,kind,...(kind==='chat'?{conversation_id:id}:{project_id:id})}).select('*').single();
 if(r.error)setError('Could not update pin. Please retry.');else{setPin(pin?undefined:r.data as PinRow);cached=undefined;}setBusy(false);}
 return <span><button type="button" className="platform-button" onClick={()=>void toggle()} disabled={busy} aria-pressed={!!pin} title={error||`${pin?'Unpin':'Pin'} ${kind}`}><Pin size={14} fill={pin?'currentColor':'none'}/><span>{pin?'Pinned':'Pin'} {kind}</span></button>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</span>;
}
