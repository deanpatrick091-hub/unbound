"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";

import { useShell, type ConversationSummary } from "@/components/shell/shell-context";
import { cn } from "@/lib/utils";

interface ConversationItemProps {
  conversation: ConversationSummary;
  active: boolean;
  onNavigate?: () => void;
}

type Mode = "idle" | "renaming" | "confirming-delete" | "working";

export function ConversationItem({ conversation, active, onNavigate }: ConversationItemProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { renameConversationLocal, removeConversationLocal, refreshConversations } = useShell();
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "renaming") inputRef.current?.select();
  }, [mode]);

  const startRename = () => {
    setDraft(conversation.title);
    setError(null);
    setMode("renaming");
  };

  const commitRename = async () => {
    const title = draft.trim();
    if (!title || title === conversation.title) {
      setMode("idle");
      return;
    }
    setMode("working");
    const previous = conversation.title;
    renameConversationLocal(conversation.id, title);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMode("idle");
    } catch {
      renameConversationLocal(conversation.id, previous);
      setError("Rename failed");
      setMode("idle");
    }
  };

  const confirmDelete = async () => {
    setMode("working");
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      removeConversationLocal(conversation.id);
      if (pathname === `/c/${conversation.id}`) router.push("/");
    } catch {
      setError("Delete failed");
      setMode("idle");
      void refreshConversations();
    }
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMode("idle");
    }
  };

  return (
    <li
      className={cn(
        "group relative rounded-md text-sm transition-colors",
        active ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      {mode === "renaming" ? (
        <div className="flex items-center gap-1 py-1 pr-1 pl-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onRenameKey}
            onBlur={() => void commitRename()}
            maxLength={120}
            aria-label="Conversation title"
            className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-sm text-foreground outline-none ring-1 ring-ring/60 focus:ring-ring"
          />
          <IconButton label="Save title" onMouseDown={(e) => e.preventDefault()} onClick={() => void commitRename()}>
            <Check className="size-3.5" />
          </IconButton>
          <IconButton label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setMode("idle")}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      ) : mode === "confirming-delete" ? (
        <div className="flex items-center gap-1 py-1 pr-1 pl-3">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Delete this chat?</span>
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
            href={`/c/${conversation.id}`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="block truncate rounded-md py-2 pr-16 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={conversation.title}
          >
            {conversation.title}
          </Link>
          <div
            className={cn(
              "absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
              mode === "working" && "opacity-100",
            )}
          >
            {mode === "working" ? (
              <span className="flex size-7 items-center justify-center" aria-live="polite">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Working" />
              </span>
            ) : (
              <>
                <IconButton label={`Rename “${conversation.title}”`} onClick={startRename}>
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton label={`Delete “${conversation.title}”`} onClick={() => setMode("confirming-delete")}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </>
            )}
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="px-3 pb-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function IconButton({
  label,
  tone = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        tone === "danger" && "hover:text-destructive",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
