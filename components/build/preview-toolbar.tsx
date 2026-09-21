"use client";

import { useRef } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";

import type { ViewportPreset } from "@/components/build/site-preview";
import { SITE_FILE_NAMES, type SiteFiles } from "@/lib/build/types";
import { cn } from "@/lib/utils";

interface PreviewToolbarProps {
  viewport: ViewportPreset;
  onViewportChange: (preset: ViewportPreset) => void;
  onRefresh: () => void;
  files: SiteFiles;
  hasSite: boolean;
  writing: string | null;
}

const PRESETS: Array<{ id: ViewportPreset; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

export function PreviewToolbar({ viewport, onViewportChange, onRefresh, files, hasSite, writing }: PreviewToolbarProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-3">
      <div role="group" aria-label="Preview size" className="flex items-center gap-0.5 rounded-md bg-surface p-0.5">
        {PRESETS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewportChange(id)}
            aria-pressed={viewport === id}
            aria-label={label}
            title={label}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              viewport === id ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </div>

      <p className="min-w-0 flex-1 truncate text-center text-[11px] text-subtle" aria-live="polite">
        {writing ? `Writing ${writing}…` : hasSite ? "Live preview · sandboxed" : ""}
      </p>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onRefresh}
          disabled={!hasSite}
          aria-label="Refresh preview"
          title="Refresh"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
        </button>

        {/* Opens the assembled page from /api/build/preview, which serves it
            with a CSP `sandbox` header so the new tab has an opaque origin.
            A blob: URL would be same-origin with UNBOUND — deliberately avoided. */}
        <form ref={formRef} method="post" action="/api/build/preview" target="_blank" rel="noopener" className="contents">
          {SITE_FILE_NAMES.map((name) => (
            <input key={name} type="hidden" name={name} value={files[name] ?? ""} />
          ))}
          <button
            type="submit"
            disabled={!hasSite}
            aria-label="Open preview in a new tab"
            title="Open in new tab"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
