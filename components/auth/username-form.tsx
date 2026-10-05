'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowRight, Loader2, Orbit } from 'lucide-react';
import { ThemeToggle } from '@/components/appearance/theme-toggle';
export function AuthForm({signedIn,username,hasGuestWork}:{signedIn:boolean;username:string;hasGuestWork:boolean}) {
  const router=useRouter();
  const [mode,setMode] = useState<'signup'|'login'>(hasGuestWork || signedIn ? 'signup' : 'login');
  const [identity,setIdentity] = useState(username);
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const pending=useRef(false);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const response=await fetch('/api/auth/username',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:signedIn?'claim':mode,username:identity,password})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error || 'Please retry.');
      // Refresh server components after the route writes the session cookies.
      router.replace('/');
      router.refresh();
    } catch(e){setError(e instanceof Error?e.message:'Please retry.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-16">
    <div aria-hidden="true" className="pointer-events-none absolute h-[70vw] w-[70vw] min-w-[520px] rounded-full border border-foreground/10 shadow-[0_0_120px_rgba(160,160,160,0.08)]"/>
    <div className="absolute right-5 top-5"><ThemeToggle/></div>
    <section className="glass-panel relative w-full max-w-md rounded-3xl border p-7 shadow-2xl sm:p-10">
      <div className="flex items-center gap-3 text-xs font-medium tracking-[.3em]"><Orbit size={24} aria-hidden="true"/>UNBOUND</div>
      <h1 className="mt-10 text-3xl font-medium tracking-tight">{signedIn?'Make it yours.':mode==='signup'?'Your next chapter.':'Welcome back.'}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{signedIn?'Choose your unique username. Your existing account and projects stay with you.':mode==='signup'?'Choose a username and password. No email required.':'Your ideas, projects, and conversations. All here.'}</p>
      {!signedIn&&<div className="mt-7 flex rounded-xl border p-1" aria-label="Account action">{(['login','signup'] as const).map(value=><button key={value} type="button" disabled={busy} aria-pressed={mode===value} onClick={()=>{setMode(value);setError('');}} className={'flex-1 rounded-lg px-3 py-2 text-sm '+(mode===value?'bg-foreground text-background':'text-muted-foreground')}>{value==='login'?'Sign in':'Create account'}</button>)}</div>}
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block text-sm">{mode==='login'&&!signedIn?'Username or existing email':'Username'}<input required name="username" autoComplete="username" maxLength={mode==='login'?254:31} spellCheck={false} autoCapitalize="none" className="platform-input mt-2 w-full" placeholder={mode==='login'?'Your username':'@yourname'} value={identity} onChange={e=>setIdentity(e.target.value)} disabled={busy}/></label>
        {!signedIn&&<label className="block text-sm">Password<input required name="password" type="password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={mode==='signup'?10:1} maxLength={128} className="platform-input mt-2 w-full" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>}
        {hasGuestWork&&<p className="rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">{mode==='signup'?'Creating your account keeps this browser’s existing chats and projects.':'Signing in opens another account. To keep access to this browser’s guest work, choose Create account first.'}</p>}
        {hasGuestWork&&mode==='login'&&!signedIn&&<label className="flex items-start gap-2 text-xs"><input type="checkbox" required className="mt-0.5"/>I understand this guest workspace stays separate.</label>}
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background disabled:opacity-60">{busy?<Loader2 size={16} className="animate-spin"/>:<ArrowRight size={16}/>} {busy?'Connecting…':signedIn?'Save username':mode==='signup'?'Create account':'Sign in'}</button>
        {mode==='signup'&&!signedIn&&<p className="text-xs leading-relaxed text-muted-foreground">Use at least 10 characters. Keep your password safe. Username-only accounts do not yet support password recovery.</p>}
      </form>
    </section>
  </main>;
}
