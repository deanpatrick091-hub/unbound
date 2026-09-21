"use client";

import { useState } from "react";
import { AlertCircle, Eye, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";

import { PreviewToolbar } from "@/components/build/preview-toolbar";
import { SitePreview, type ViewportPreset } from "@/components/build/site-preview";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { useShell } from "@/components/shell/shell-context";
import { useBuilder, type BuilderStatus } from "@/hooks/use-builder";
import { BUILD_LIMITS } from "@/lib/build/types";
import { cn } from "@/lib/utils";

interface BuilderScreenProps {
  model: string;
}

const STATUS_ANNOUNCEMENTS: Record<BuilderStatus, string> = {
  idle: "",
  submitting: "UNBOUND is planning the site.",
  streaming: "UNBOUND is writing the site.",
  error: "The last build failed.",
};

type MobileTab = "chat" | "preview";

/**
 * Split workspace: conversation on the left (~45%), live sandboxed preview
 * on the right (~55%). Below `lg` the two become tabs.
 */
export function BuilderScreen({ model }: BuilderScreenProps) {
  const { user } = useShell();
  const builder = useBuilder({ userId: user.id, model });
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const previewVersion = builder.version * 1000 + refreshNonce;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile: tab switcher */}
      <div role="tablist" aria-label="Workspace" className="flex h-11 shrink-0 items-stretch border-b lg:hidden">
        <MobileTabButton active={mobileTab === "chat"} onClick={() => setMobileTab("chat")} icon={MessageSquare}>
          Chat
        </MobileTabButton>
        <MobileTabButton active={mobileTab === "preview"} onClick={() => setMobileTab("preview")} icon={Eye}>
          Preview
          {builder.isBusy ? <span className="ml-1.5 size-1.5 rounded-full bg-brand animate-pulse-soft" aria-hidden="true" /> : null}
        </MobileTabButton>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: chat (45%) */}
        <section
          aria-label="Builder conversation"
          className={cn(
            "flex min-h-0 min-w-0 flex-col lg:flex lg:w-[45%] lg:border-r",
            mobileTab === "chat" ? "flex w-full" : "hidden",
          )}
        >
          <div className="hidden h-12 shrink-0 items-center justify-between border-b px-4 lg:flex">
            <h1 className="text-sm font-medium">Website builder</h1>
            <button
              type="button"
              onClick={builder.reset}
              disabled={builder.messages.length === 0 && !builder.hasSite}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors outline-none hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Start over
            </button>
          </div>

          <MessageList messages={builder.messages} isBusy={builder.isBusy} emptyState={<EmptyState />} />

          <p role="status" className="sr-only">
            {STATUS_ANNOUNCEMENTS[builder.status]}
          </p>

          {builder.error ? (
            <div className="px-3 pb-2 sm:px-4">
              <div
                role="alert"
                className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive animate-rise-in"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0 flex-1 basis-48">{builder.error.message}</p>
                <div className="ml-auto flex items-center gap-1">
                  {builder.error.code !== "limit_reached" && builder.messages.some((m) => m.role === "user") ? (
                    <button
                      type="button"
                      onClick={() => {
                        const last = [...builder.messages].reverse().find((m) => m.role === "user");
                        builder.clearError();
                        if (last) void builder.send(last.content);
                      }}
                      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" />
                      Retry
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={builder.clearError}
                    aria-label="Dismiss error"
                    className="flex size-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <Composer
            isBusy={builder.isBusy}
            model={builder.model}
            onModelChange={builder.setModel}
            onSend={(text) => {
              void builder.send(text);
              // On phones, jump to the preview so the user sees it build.
              if (window.matchMedia("(max-width: 1023px)").matches) setMobileTab("preview");
            }}
            onStop={builder.stop}
            placeholder={builder.hasSite ? "Describe a change… e.g. “make the hero darker”" : "Describe the website you want…"}
            maxLength={BUILD_LIMITS.maxInstructionLength}
            hint="Enter to send · Shift+Enter for a new line · each request edits the current site"
            autoFocus
          />
        </section>

        {/* Right: preview (55%) */}
        <section
          aria-label="Website preview"
          className={cn("min-h-0 min-w-0 flex-col lg:flex lg:w-[55%]", mobileTab === "preview" ? "flex w-full" : "hidden")}
        >
          <PreviewToolbar
            viewport={viewport}
            onViewportChange={setViewport}
            onRefresh={() => setRefreshNonce((n) => n + 1)}
            files={builder.files}
            hasSite={builder.hasSite}
            writing={builder.writing}
          />
          <div className="min-h-0 flex-1">
            <SitePreview files={builder.files} version={previewVersion} viewport={viewport} isBuilding={builder.isBusy} />
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileTabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-b-2 border-brand text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

function EmptyState() {
  const examples = [
    "Build me a modern website for a restaurant",
    "Create a landing page for a fitness app",
    "Make a portfolio site for a photographer",
  ];
  return (
    <div className="max-w-sm text-center animate-rise-in">
      <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">Builder</p>
      <h2 className="mt-4 text-2xl font-medium tracking-tight">What should we build?</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Describe the site. Then keep talking to change it — “make the hero darker”, “add an about section”, “make it
        feel more premium”.
      </p>
      <ul className="mt-6 space-y-1.5 text-left">
        {examples.map((e) => (
          <li key={e} className="rounded-md border bg-surface/60 px-3 py-2 text-xs text-muted-foreground">
            “{e}”
          </li>
        ))}
      </ul>
    </div>
  );
}
