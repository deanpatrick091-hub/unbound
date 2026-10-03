"use client";

import Link from "next/link";
import {PinButton} from "@/components/projects/pin-button";
import {PeoplePanel} from "@/components/projects/people-panel";
import type {ProjectSnapshot} from "@/lib/projects/types";
import { useRef, useState } from "react";
import { AlertCircle, Eye, MessageSquare, RotateCcw, Maximize, X } from "lucide-react";

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
  project: ProjectSnapshot;
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
 * on the right (~55%). Below `md` the two become tabs.
 */
export function BuilderScreen({ model,project }: BuilderScreenProps) {
  const { user } = useShell();
  const builder = useBuilder({ userId: user.id, model,project });
  const previewRef=useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  async function sendAndPreview(text: string) {
    if (await builder.send(text)) setMobileTab("preview");
  }

  const previewVersion = builder.version * 1000 + refreshNonce;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2"><Link href="/build" className="platform-button">Projects</Link><h1 className="mr-auto truncate text-sm">{project.name}</h1><span className="text-xs text-subtle">{builder.isBusy?'Building…':builder.status==='error'?'Previous version preserved':`Saved · v${builder.version}`}</span><PinButton kind="project" id={project.id}/><PinButton kind="website" id={project.id}/><PeoplePanel project={project}/><Link href={'/build/'+project.id+'/history'} className="platform-button">History</Link></div>
      {/* Mobile: tab switcher */}
      <div role="tablist" aria-label="Workspace" className="flex h-11 shrink-0 items-stretch border-b md:hidden">
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
            "flex min-h-0 min-w-0 flex-col md:flex md:w-[45%] md:border-r",
            mobileTab === "chat" ? "flex w-full" : "hidden",
          )}
        >
          <div className="hidden h-12 shrink-0 items-center justify-between border-b px-4 md:flex">
            <h1 className="text-sm font-medium">Website builder</h1>

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
                        if (last) void sendAndPreview(last.content);
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

          {builder.hasSite ? (
            <button type="button" onClick={() => setMobileTab("preview")} className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border bg-raised px-3 py-2 text-sm md:hidden">
              <Eye className="size-4" aria-hidden="true" /> View website preview
            </button>
          ) : null}
          {project.role==='viewer'?<p className="p-4 text-sm text-subtle">Viewer access · this project is read-only.</p>:<Composer
            isBusy={builder.isBusy}
            model={builder.model}
            onModelChange={builder.setModel}
            onSend={sendAndPreview}
            onStop={builder.stop}
            placeholder={builder.hasSite ? "Describe a change… e.g. “make the hero darker”" : "Describe the website you want…"}
            maxLength={BUILD_LIMITS.maxInstructionLength}
            hint="Enter to send · Shift+Enter for a new line · each request edits the current site"
            suggestions={["Build a landing page","Create a portfolio","Make it responsive","Improve this website"]}
            autoFocus
          />}
        </section>

        {/* Right: preview (55%) */}
        <section
          ref={previewRef}
          aria-label="Website preview"
          className={cn("min-h-0 min-w-0 flex-col md:flex md:w-[55%]", mobileTab === "preview" ? "flex w-full" : "hidden")}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-medium">Live website preview</h2><button className="platform-button ml-auto" aria-label="Fullscreen preview" onClick={()=>void previewRef.current?.requestFullscreen().catch(()=>{})}><Maximize size={14}/></button>
          </div>
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

