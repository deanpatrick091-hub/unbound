"use client";

import { useMemo } from "react";
import { Globe } from "lucide-react";

import { assembleDocument, PREVIEW_SANDBOX } from "@/lib/build/assemble";
import type { SiteFiles } from "@/lib/build/types";
import { cn } from "@/lib/utils";

export type ViewportPreset = "desktop" | "tablet" | "mobile";

export const VIEWPORT_WIDTHS: Record<ViewportPreset, number | null> = {
  desktop: null, // fill the pane
  tablet: 820,
  mobile: 390,
};

interface SitePreviewProps {
  files: SiteFiles;
  /** Bumped by the workspace whenever the site changes or the user hits refresh. */
  version: number;
  viewport: ViewportPreset;
  isBuilding: boolean;
}

/**
 * The generated site, rendered in a sandboxed iframe.
 *
 * Isolation:
 *  - `sandbox` WITHOUT allow-same-origin → the document has an opaque origin.
 *    It cannot read UNBOUND's cookies or localStorage, and any request it
 *    makes to UNBOUND's API is uncredentialed (and blocked by CSP anyway).
 *  - `srcdoc` carries the assembled document, which includes a strict CSP
 *    (see lib/build/assemble.ts): no network calls, no frames, no forms.
 *  - `referrerpolicy="no-referrer"` keeps the app URL out of third-party logs.
 */
export function SitePreview({ files, version, viewport, isBuilding }: SitePreviewProps) {
  const document = useMemo(() => (files["index.html"] ? assembleDocument(files) : null), [files]);
  const width = VIEWPORT_WIDTHS[viewport];

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-xs text-center animate-rise-in">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-raised text-muted-foreground">
            <Globe className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-medium">{isBuilding ? "Building your website…" : "Your website will appear here"}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Describe what you want on the left — for example, “Build me a modern website for a restaurant.”
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin flex h-full items-start justify-center overflow-auto bg-surface p-3 sm:p-5">
      <div
        className={cn(
          "relative h-full overflow-hidden rounded-lg border bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] transition-[width] duration-300",
          width ? "shrink-0" : "w-full",
        )}
        style={width ? { width: `${width}px`, maxWidth: "100%" } : undefined}
      >
        <iframe
          key={version}
          title="Website preview"
          srcDoc={document}
          sandbox={PREVIEW_SANDBOX}
          referrerPolicy="no-referrer"
          loading="eager"
          className="block h-full w-full bg-white"
        />
        {isBuilding ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-brand/20"
          >
            <div className="h-full w-1/3 bg-brand animate-[shimmer_1.2s_ease-in-out_infinite]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
