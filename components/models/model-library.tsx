"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderOpen, Search, Sparkles } from "lucide-react";
import { useShell } from "@/components/shell/shell-context";
import { groupByProvider } from "@/lib/ai/models";
import { PROVIDER_DIRECTORY } from "@/lib/ai/provider-directory";

export function ModelLibrary() {
  const { models } = useShell();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupByProvider(models.filter(model =>
    (model.label + " " + model.provider + " " + model.model).toLowerCase().includes(query.trim().toLowerCase()))), [models, query]);
  return <div className="scrollbar-thin flex-1 overflow-y-auto">
    <div className="mx-auto max-w-6xl px-5 py-9 sm:px-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Explore your models</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Different minds.<br /><span className="text-brand">One workspace.</span></h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">Choose a model to start a conversation. Free allowances vary by provider; availability can change.</p>
        </div>
        <span className="glass-panel rounded-full px-4 py-2 text-sm">{models.length} connected models</span>
      </div>
      <label className="glass-panel mt-8 flex max-w-lg items-center gap-3 rounded-2xl px-4 py-3">
        <Search size={18} className="text-muted-foreground" /><span className="sr-only">Search models</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a model or provider…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <div className="mt-9 space-y-8">
        {groups.map(group => <details key={group.provider} open>
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl py-3 text-base font-medium">
            <FolderOpen size={19} className="text-brand" />{group.label}<span className="text-sm font-normal text-subtle">{group.models.length} models</span>
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.models.map(model => <article key={model.id} className="model-tile glass-panel">
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="brand-mark"><Sparkles size={19} /></span>
                <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{model.health?.state && model.health.state !== "available" ? model.health.state.replaceAll("_", " ") : "Free tier"}</span>
              </div>
              <h2 className="break-words text-base font-medium">{model.label}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{model.health?.reason || model.description || "Text generation"}</p>
              <Link href={"/?model=" + encodeURIComponent(model.id)} className="mt-6 inline-flex items-center justify-between gap-3 border-t pt-4 text-sm text-brand">Start a chat <ArrowUpRight size={17} /></Link>
            </article>)}
          </div>
        </details>)}
        {!groups.length && <p role="status" className="glass-panel rounded-2xl p-6 text-sm text-muted-foreground">{models.length ? "No models match that search." : "No free models are connected right now. Please check back soon."}</p>}
      </div>
      <section className="mt-12 border-t pt-8" aria-label="Free provider connections">
        <h2 className="text-xl font-medium">More ways to think.</h2>
        <p className="mt-2 text-sm text-muted-foreground">The free connections supported by this workspace. Only connected models appear in the chat selector.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {PROVIDER_DIRECTORY.filter(provider => !query.trim() || (provider.label + " " + provider.allowance).toLowerCase().includes(query.trim().toLowerCase())).map(provider => {
            const count = models.filter(model => model.provider === provider.id).length;
            return <details key={provider.id} className="glass-panel rounded-2xl p-4">
              <summary className="flex cursor-pointer items-center gap-3 text-sm font-medium"><FolderOpen size={17} className="text-brand" />{provider.label}<span className="ml-auto text-xs font-normal text-muted-foreground">{count ? count + " available" : "Not connected"}</span></summary>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{provider.allowance}</p>
              {!count && <p className="mt-3 text-xs text-subtle">This connection needs to be enabled by the site owner.</p>}
              {provider.id === "cloudflare" && count > 0 && <Link href="/image-gen" className="mt-3 inline-block text-sm text-brand">Open FLUX image studio →</Link>}
            </details>;
          })}
        </div>
      </section>
    </div>
  </div>;
}
