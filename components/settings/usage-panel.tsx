import type { UsageSummary } from "@/lib/data/account";
import { USAGE_LIMITS } from "@/lib/limits/config";

interface UsagePanelProps {
  usage: UsageSummary | null;
}

export function UsagePanel({ usage }: UsagePanelProps) {
  if (!usage) {
    return <p className="text-sm text-muted-foreground">Usage isn&apos;t available right now.</p>;
  }

  const rows = [
    { label: "Requests today", used: usage.dayUnits, limit: USAGE_LIMITS.unitsPerDay },
    { label: "Requests this month", used: usage.monthUnits, limit: USAGE_LIMITS.unitsPerMonth },
    { label: "Tokens today", used: usage.dayTokens, limit: USAGE_LIMITS.tokensPerDay },
    { label: "Tokens this month", used: usage.monthTokens, limit: USAGE_LIMITS.tokensPerMonth },
  ];

  return (
    <dl className="space-y-4">
      {rows.map(({ label, used, limit }) => {
        const pct = Math.min(100, Math.round((used / limit) * 100));
        return (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm">{label}</dt>
              <dd className="text-xs tabular-nums text-muted-foreground">
                {used.toLocaleString()} / {limit.toLocaleString()}
              </dd>
            </div>
            <div
              role="progressbar"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised"
            >
              <div
                className={pct >= 90 ? "h-full bg-destructive/80" : "h-full bg-brand/80"}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-subtle">A chat turn costs 1 request; a Council run costs 5.</p>
    </dl>
  );
}
