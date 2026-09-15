"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, Trash2, X } from "lucide-react";

import { IconButton } from "@/components/shell/conversation-item";
import { useShell, type CouncilSummary } from "@/components/shell/shell-context";
import { cn } from "@/lib/utils";

interface CouncilItemProps {
  session: CouncilSummary;
  active: boolean;
  onNavigate?: () => void;
}

export function CouncilItem({ session, active, onNavigate }: CouncilItemProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { removeCouncilLocal, refreshCouncil } = useShell();
  const [mode, setMode] = useState<"idle" | "confirming" | "working">("idle");

  const confirmDelete = async () => {
    setMode("working");
    try {
      const res = await fetch(`/api/council/${session.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      removeCouncilLocal(session.id);
      if (pathname === `/council/${session.id}`) router.push("/council");
    } catch {
      setMode("idle");
      void refreshCouncil();
    }
  };

  const statusDot =
    session.status === "complete"
      ? "bg-brand"
      : session.status === "running"
        ? "bg-muted-foreground animate-pulse-soft"
        : "bg-destructive/70";

  return (
    <li
      className={cn(
        "group relative rounded-md text-sm transition-colors",
        active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      {mode === "confirming" ? (
        <div className="flex items-center gap-1 py-1 pr-1 pl-3">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Delete this session?</span>
          <IconButton label="Confirm delete" tone="danger" onClick={() => void confirmDelete()}>
            <Check className="size-3.5" />
          </IconButton>
          <IconButton label="Keep" onClick={() => setMode("idle")}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      ) : (
        <>
          <Link
            href={`/council/${session.id}`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="flex items-center gap-2 rounded-md py-2 pr-9 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={session.title}
          >
            <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", statusDot)} />
            <span className="truncate">{session.title}</span>
          </Link>
          <div className="absolute inset-y-0 right-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {mode === "working" ? (
              <span className="flex size-7 items-center justify-center">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Working" />
              </span>
            ) : (
              <IconButton label={`Delete “${session.title}”`} onClick={() => setMode("confirming")}>
                <Trash2 className="size-3.5" />
              </IconButton>
            )}
          </div>
        </>
      )}
    </li>
  );
}
