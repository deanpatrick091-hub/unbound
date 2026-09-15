"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Plus, Settings, Users } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ConversationItem } from "@/components/shell/conversation-item";
import { CouncilItem } from "@/components/shell/council-item";
import { useShell } from "@/components/shell/shell-context";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";

interface SidebarProps {
  /** Called after a navigation from inside the sidebar (closes the mobile drawer). */
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, conversations, councilSessions } = useShell();

  const area: "chat" | "council" = pathname.startsWith("/council") ? "council" : "chat";
  const activeId = useMemo(() => {
    const match = pathname.match(/^\/(?:c|council)\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const list = area === "chat" ? conversations : councilSessions;
  const name = user.displayName || user.email || "Account";
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/" onClick={onNavigate} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-1 px-3 pb-3">
        <NavTile href="/" icon={Plus} label="New chat" active={area === "chat"} onClick={onNavigate} />
        <NavTile href="/council" icon={Users} label="Council" active={area === "council"} onClick={onNavigate} />
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
          {area === "chat" ? "Recent" : "Sessions"}
        </span>
        {area === "council" && councilSessions.length > 0 ? (
          <Link
            href="/council"
            onClick={onNavigate}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            New
          </Link>
        ) : null}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-subtle">
            {area === "chat" ? "No conversations yet." : "No Council sessions yet."}
          </p>
        ) : area === "chat" ? (
          <ul className="space-y-px">
            {conversations.map((c) => (
              <ConversationItem key={c.id} conversation={c} active={c.id === activeId} onNavigate={onNavigate} />
            ))}
          </ul>
        ) : (
          <ul className="space-y-px">
            {councilSessions.map((s) => (
              <CouncilItem key={s.id} session={s} active={s.id === activeId} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t p-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-medium text-foreground"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-tight">{name}</p>
            {user.displayName && user.email ? (
              <p className="truncate text-[11px] leading-tight text-subtle">{user.email}</p>
            ) : null}
          </div>
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-label="Settings"
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none",
              pathname === "/settings" && "bg-raised text-foreground",
            )}
          >
            <Settings className="size-4" />
          </Link>
          <SignOutButton iconOnly />
        </div>
      </div>
    </nav>
  );
}

function NavTile({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: typeof MessageSquare;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-border-strong bg-raised text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-surface hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
