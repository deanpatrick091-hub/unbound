"use client";

import { useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import puter from "@heyputer/puter.js";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MODELS = [
  { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro" },
  { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { id: "google/gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite" },
  { id: "google/gemini-2.5-flash-image", label: "Nano Banana" },
] as const;

type ModelId = (typeof MODELS)[number]["id"];

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; src: string }
  | { status: "error"; message: string };

function initialResults(): Record<ModelId, ResultState> {
  return Object.fromEntries(MODELS.map((m) => [m.id, { status: "idle" as const }])) as Record<ModelId, ResultState>;
}

export default function ImageGenPage() {
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<Record<ModelId, ResultState>>(initialResults);

  const isGenerating = Object.values(results).some((r) => r.status === "loading");
  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    setResults(
      Object.fromEntries(MODELS.map((m) => [m.id, { status: "loading" as const }])) as Record<ModelId, ResultState>,
    );

    for (const model of MODELS) {
      puter.ai
        .txt2img(trimmed, { model: model.id })
        .then((image) => {
          setResults((prev) => ({ ...prev, [model.id]: { status: "done", src: image.src } }));
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Generation failed.";
          setResults((prev) => ({ ...prev, [model.id]: { status: "error", message } }));
        });
    }
  };

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="animate-rise-in">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">Playground</p>
          <h1 className="mt-3 text-2xl font-medium tracking-tight">Image Gen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One prompt, four Nano Banana models side by side — powered by{" "}
            <a
              href="https://puter.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Puter.js
            </a>
            . Runs entirely in your browser; no API key required.
          </p>
        </header>

        <div className="mt-8 space-y-3 animate-rise-in">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A serene Japanese garden with cherry blossoms…"
            rows={3}
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-subtle">Cmd/Ctrl + Enter to generate</p>
            <Button onClick={handleGenerate} disabled={!canGenerate}>
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
              Generate
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {MODELS.map((model) => (
            <ResultCard key={model.id} label={model.label} result={results[model.id]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, result }: { label: string; result: ResultState }) {
  return (
    <div className="animate-rise-in overflow-hidden rounded-xl border bg-surface">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-medium">{label}</span>
        {result.status === "loading" ? <Loader2 className="size-3.5 animate-spin text-subtle" /> : null}
      </div>
      <div className="flex aspect-square items-center justify-center bg-raised/40">
        {result.status === "done" ? (
          // Puter.js resolves txt2img to a data-URL image; a plain <img> avoids
          // next/image's remote-pattern restrictions for data URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.src} alt={label} className="size-full object-cover" />
        ) : result.status === "error" ? (
          <p className="px-6 text-center text-xs text-destructive">{result.message}</p>
        ) : result.status === "loading" ? (
          <Loader2 className="size-6 animate-spin text-subtle" />
        ) : (
          <p className="px-6 text-center text-xs text-subtle">Waiting for a prompt.</p>
        )}
      </div>
    </div>
  );
}
