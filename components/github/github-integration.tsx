'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitHubStatus } from '@/lib/github/types';
const labels: Record<GitHubStatus['state'], string> = { SETUP_REQUIRED: 'Setup required', DISCONNECTED: 'Not connected', CONNECTED: 'Connected', RECONNECT_REQUIRED: 'Reconnect required', UNAVAILABLE: 'Could not verify connection' };
export function GitHubIntegration() {
  const [status, setStatus] = useState<GitHubStatus>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [output, setOutput] = useState('');
  const [action, setAction] = useState('repositories'), [query, setQuery] = useState(''), [repository, setRepository] = useState(''), [path, setPath] = useState('README.md'), [ref, setRef] = useState(''), [number, setNumber] = useState('1');
  const busyRef = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/integrations/github', { cache: 'no-store', signal });
    const body = await response.json();
    if (!response.ok) throw Error(body.error || 'Could not load GitHub connection.');
    setStatus(body);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/integrations/github', { cache: 'no-store', signal: abort.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not load GitHub connection.');
      if (abort.signal.aborted) return;
      setStatus(body);
      const outcome = new URL(location.href).searchParams.get('github');
      const messages: Record<string, string> = { connected: 'GitHub connected and read tools verified.', denied: 'GitHub authorization was cancelled.', failed: 'GitHub could not be connected. Check setup, installation and permissions, then start again.', 'install-required': 'Install the GitHub App on selected repositories first, then connect.', permissions: 'The GitHub App requests too much access. The owner must set only Contents, Issues and Metadata to read-only.' };
      if (outcome && messages[outcome]) { setNotice(messages[outcome]); const url = new URL(location.href); url.searchParams.delete('github'); history.replaceState(null, '', url); }
    }).catch(e => { if (!abort.signal.aborted) { setStatus({ state: 'UNAVAILABLE' }); setError(e.message); } });
    return () => abort.abort();
  }, []);
  async function request(operation: string, body?: unknown) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/integrations/github/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(65000) });
      const data = await response.json();
      if (!response.ok) {
        if (['RECONNECT_REQUIRED', 'AUTHENTICATION_REQUIRED'].includes(data.code)) setStatus(s => ({ ...s, state: 'RECONNECT_REQUIRED' }));
        throw Error(data.error || 'GitHub request failed.');
      }
      if (operation === 'connect') {
        const target = new URL(data.url);
        if (target.origin !== 'https://github.com' || target.pathname !== '/login/oauth/authorize') throw Error('Invalid authorization destination.');
        location.assign(target.href);
      } else if (operation === 'run') {
        const content = data.result?.content ?? [];
        setOutput(content.map((block: { type?: string; text?: string; resource?: { text?: string } }) => block.type === 'text' ? block.text : block.resource?.text ?? JSON.stringify(block, null, 2)).join('\n\n') || JSON.stringify(data.result?.structuredContent ?? data.result, null, 2));
      } else {
        setOutput(''); setNotice(data.message || 'GitHub connection verified.'); await load();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'GitHub request failed.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function run() {
    const [owner, repo, extra] = repository.trim().split('/');
    if (action !== 'repositories' && (!owner || !repo || extra)) { setError('Enter a repository as owner/repository.'); return; }
    void request('run', action === 'repositories' ? { action, query } : action === 'file' ? { action, owner, repo, path, ref } : action === 'issue' ? { action, owner, repo, number: Number(number) } : { action, owner, repo });
  }
  return <section className="mx-auto w-full max-w-5xl border-b border-border px-5 py-7 sm:px-9" aria-labelledby="github-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="github-heading" className="text-lg font-medium">GitHub</h2><p className="mt-1 text-sm text-muted-foreground">Read repositories, files and issues with your own account.</p></div><p className="text-sm" role="status">{status ? labels[status.state] : 'Checking connection…'}{status?.login ? ` · @${status.login}` : ''}</p></div>
    <p className="mt-3 text-xs text-muted-foreground">Read-only. No code changes or paid Copilot tools. GitHub API quotas and organization policies apply.</p>
    {status?.message && <p className="mt-3 text-sm">{status.message}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="platform-button" disabled={busy || !status || status.state === 'SETUP_REQUIRED' || status.state === 'UNAVAILABLE'} onClick={() => void request('connect')}>{busy ? 'Working…' : status?.state === 'CONNECTED' || status?.state === 'RECONNECT_REQUIRED' ? 'Reconnect GitHub' : 'Connect GitHub'}</button>
      {status?.installUrl && <a className="platform-button" href={status.installUrl} target="_blank" rel="noopener noreferrer">Choose repositories on GitHub</a>}
      {status && ['CONNECTED', 'RECONNECT_REQUIRED'].includes(status.state) && <><button className="platform-button" disabled={busy} onClick={() => void request('verify')}>Check connection</button><button className="platform-button" disabled={busy} onClick={() => void request('disconnect')}>Disconnect</button></>}
      {status && ['SETUP_REQUIRED', 'UNAVAILABLE'].includes(status.state) && <button className="platform-button" disabled={busy} onClick={() => void request('disconnect')}>Remove saved connection</button>}
      {status?.state === 'UNAVAILABLE' && <button className="platform-button" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Retry status</button>}
    </div>
    {status?.verifiedAt && <p className="mt-2 text-xs text-muted-foreground">Last verified {new Date(status.verifiedAt).toLocaleString()}. Use Check connection to verify again.</p>}
    {status?.state === 'CONNECTED' && <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); run(); }}>
      <label className="text-sm">Read tool<select className="platform-input mt-1 w-full" value={action} disabled={busy} onChange={e => { setAction(e.target.value); setOutput(''); }}><option value="repositories">Find repositories</option><option value="file">Read a file or directory</option><option value="issues">List repository issues</option><option value="issue">Read an issue</option></select></label>
      {action === 'repositories' ? <label className="text-sm">Search (blank lists your repositories)<input className="platform-input mt-1 w-full" value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder="topic:react"/></label> : <label className="text-sm">Repository<input required className="platform-input mt-1 w-full" value={repository} maxLength={140} onChange={e => setRepository(e.target.value)} placeholder="owner/repository"/></label>}
      {action === 'file' && <><label className="text-sm">File or directory path<input className="platform-input mt-1 w-full" value={path} maxLength={500} onChange={e => setPath(e.target.value)}/></label><label className="text-sm">Branch or ref (optional)<input className="platform-input mt-1 w-full" value={ref} maxLength={200} onChange={e => setRef(e.target.value)}/></label></>}
      {action === 'issue' && <label className="text-sm">Issue number<input type="number" min="1" required className="platform-input mt-1 w-full" value={number} onChange={e => setNumber(e.target.value)}/></label>}
      <div className="sm:col-span-2"><button className="platform-button" disabled={busy} type="submit">{busy ? 'Reading…' : 'Run read tool'}</button></div>
    </form>}
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {notice && <p className="mt-4 text-sm" role="status">{notice}</p>}
    {output && <div className="mt-5 min-w-0"><h3 className="mb-2 text-sm font-medium">GitHub result</h3><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border p-4 text-xs">{output}</pre></div>}
  </section>;
}
