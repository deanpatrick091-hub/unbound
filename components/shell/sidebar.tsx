"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video, Search, Hammer, Image as ImageIcon, MessageSquare, Plus, Settings, Users } from "lucide-react";

import { SidebarPins } from '@/components/shell/sidebar-pins';
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

  const area: "chat" | "council" | "image" | "build" = pathname.startsWith("/council")
    ? "council"
    : pathname.startsWith("/image-gen")
      ? "image"
      : pathname.startsWith("/build")
        ? "build"
        : "chat";
  const activeId = useMemo(() => {
    const match = pathname.match(/^\/(?:c|council)\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const list = area === "chat" ? conversations : area === "council" ? councilSessions : [];
  const name = user.displayName || user.email || "Account";
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/" onClick={onNavigate} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark />
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-1.5 px-3 pb-3">
        <NavTile href="/" icon={Plus} label="New chat" active={pathname === "/" || pathname.startsWith("/c/")} onClick={onNavigate} />
        <NavTile href="/council" icon={Users} label="Council" active={area === "council"} onClick={onNavigate} />
        <NavTile href="/image-gen" icon={ImageIcon} label="Image Gen" active={area === "image"} onClick={onNavigate} />
        <NavTile href="/video-gen" icon={Video} label="Videos" active={pathname === "/video-gen"} onClick={onNavigate} />
        <NavTile href="/tools" icon={Search} label="Tools" active={pathname === "/tools"} onClick={onNavigate} />
        <NavTile href="/build" icon={Hammer} label="Build" active={area === "build"} onClick={onNavigate} />
      </div>

      <SidebarPins onNavigate={onNavigate}/>

      {area === "image" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-subtle">Bring an idea to life with image generation.</p>
        </div>
      ) : area === "build" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-xs text-subtle">Describe a website and refine it in conversation. Your projects are saved to your account.</p>
        </div>
      ) : (
        <>
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
        </>
      )}

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
        "nav-tile flex items-center gap-3 border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

