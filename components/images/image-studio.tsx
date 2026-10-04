"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ImageStudio({ connected }: { connected: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function generate() {
    if (!connected || pending.current || !prompt.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim() }), signal: AbortSignal.timeout(55000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Image generation is temporarily unavailable.");
      setSrc(data.src);
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="scrollbar-thin flex-1 overflow-y-auto"><div className="mx-auto max-w-5xl px-5 py-10 sm:px-10">
    <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Image studio</p>
    <h1 className="mt-3 text-4xl font-medium tracking-tight">From a thought to a frame.</h1>
    <p className="mt-3 max-w-xl text-muted-foreground">Explore FLUX.1 Schnell with the connected Cloudflare free allowance.</p>
    {!connected && <div className="glass-panel mt-7 rounded-2xl p-5 text-sm" role="status">Image generation is waiting for a free connection. The site owner needs to connect a Cloudflare Workers Free account. Chat and the model library are still available.</div>}
    <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.2fr]">
      <div className="glass-panel self-start rounded-3xl p-5">
        <label htmlFor="image-prompt" className="mb-3 block text-sm font-medium">Describe your image</label>
        <Textarea id="image-prompt" value={prompt} maxLength={2048} onChange={e => setPrompt(e.target.value)} placeholder="A quiet observatory above a sea of clouds, silver light, cinematic photography…" rows={6} disabled={busy || !connected} />
        <p className="mt-3 text-xs text-muted-foreground">FLUX.1 Schnell · Daily free allowance applies</p>
        <Button className="mt-5 w-full" disabled={!connected || busy || !prompt.trim()} onClick={generate}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{busy ? "Creating your image…" : "Generate image"}</Button>
        {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <div className="glass-panel overflow-hidden rounded-3xl">
        <div className="flex aspect-square items-center justify-center p-3" aria-busy={busy}>
          {src ? <Image unoptimized width={512} height={512} src={src} alt={prompt} className="size-full rounded-2xl object-contain" /> : <div className="text-center text-muted-foreground"><ImagePlus className="mx-auto mb-4 size-10" /><p>Your imagination goes here.</p></div>}
        </div>
        {src && <a href={src} download="unbound-flux.jpg" className="flex items-center justify-center gap-2 border-t p-4 text-sm hover:bg-accent"><Download className="size-4" />Download image</a>}
      </div>
    </div>
  </div></div>;
}
