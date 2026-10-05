"use client";

import { memo, type CSSProperties } from "react";
import { Loader2 } from "lucide-react";

import { Markdown } from "@/components/markdown";
import type { CouncilMemberState } from "@/lib/council/state";
import { COUNCIL_MEMBERS, type PerspectiveRole } from "@/lib/council/types";
import { cn } from "@/lib/utils";

interface MemberCardProps {
  role: PerspectiveRole;
  member: CouncilMemberState;
  style?: CSSProperties;
}

export const MemberCard = memo(function MemberCard({ role, member, style }: MemberCardProps) {
  const { label } = COUNCIL_MEMBERS[role];
  const isLive = member.status === "streaming";

  return (
    <details open
      aria-label={label}
      aria-busy={isLive}
      style={style}
      className={cn(
        "min-w-0 border-b py-5 transition-colors",
        isLive && "border-border-strong",
        member.status === "error" && "border-destructive/30",
      )}
    >
      <summary className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide">{label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{member.model}</p>
        </div>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
          {member.status === "pending" ? (
            "Queued"
          ) : member.status === "streaming" ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Thinking
            </span>
          ) : member.status === "complete" ? (
            "Done"
          ) : member.status === "cancelled" ? (
            "Stopped"
          ) : (
            <span className="text-destructive/80">{/rate|limit|allowance/i.test(member.message??'')?'Rate limited':'Failed'}</span>
          )}
        </span>
      </summary>

      <div className="mt-3 min-w-0 flex-1 text-[14px]">
        {member.text ? (
          <Markdown content={member.text} className="text-[14px]" />
        ) : member.status === "error" ? (
          <p className="text-sm text-destructive/80">{member.message ?? "No response."}</p>
        ) : member.status === "cancelled" ? (
          <p className="text-sm text-muted-foreground">Cancelled.</p>
        ) : (
          <div className="space-y-2 pt-1" aria-hidden="true">
            <div className="h-3 w-11/12 rounded bg-raised animate-pulse-soft" />
            <div className="h-3 w-4/5 rounded bg-raised animate-pulse-soft" />
            <div className="h-3 w-3/5 rounded bg-raised animate-pulse-soft" />
          </div>
        )}
      </div>
    </details>
  );
});
