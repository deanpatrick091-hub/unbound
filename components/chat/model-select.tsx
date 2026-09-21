"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { describeModel, qualifyModelId } from "@/lib/ai/models";
import {
  HEALTH_LABELS,
  PROVIDER_IDS,
  PROVIDER_LABELS,
  type ModelHealthState,
  type ModelOption,
  type ProviderStatus,
} from "@/lib/ai/types";
import { cn } from "@/lib/utils";

interface ModelSelectProps {
  value: string;
  onChange: (model: string) => void;
  /** Models the server can serve; grouped by provider in the picker. */
  models: readonly ModelOption[];
  /** Every provider, including ones that aren't configured (shown, disabled). */
  providers?: readonly ProviderStatus[];
  disabled?: boolean;
  className?: string;
  /** Visible label text (defaults to a screen-reader-only label). */
  label?: string;
  name?: string;
}

/** Text glyph per state — works inside a native <option>, which can't be styled. */
const HEALTH_GLYPH: Record<ModelHealthState, string> = {
  available: "",
  busy: "● Busy",
  rate_limited: "● Rate limited",
  timeout: "● Timeout",
  unavailable: "● Temporarily unavailable",
  restricted: "● Restricted upstream",
};

const HEALTH_DOT_CLASS: Record<ModelHealthState, string> = {
  available: "bg-brand",
  busy: "bg-amber-400",
  rate_limited: "bg-amber-400",
  timeout: "bg-amber-400",
  unavailable: "bg-muted-foreground",
  restricted: "bg-destructive/80",
};

/**
 * A native <select> (keyboard, screen readers, and the OS picker on mobile
 * all for free) laid invisibly over a styled "Provider · Model" readout, so
 * the closed control shows both parts — native selects only show the option
 * text, never its optgroup.
 *
 * Every provider is listed. Unconfigured ones appear with a disabled note
 * ("API key required", "Local server offline") rather than disappearing, and
 * models keep their place in the list whatever their current health.
 */
export function ModelSelect({ value, onChange, models, providers, disabled, className, label, name }: ModelSelectProps) {
  const id = useId();
  const current = qualifyModelId(value);
  const selected = models.find((m) => m.id === current);
  const known = Boolean(selected);
  const described = describeModel(current, models);
  const isDisabled = disabled || models.length === 0;
  const health: ModelHealthState = selected?.health ?? "available";

  const statusFor = (provider: ProviderStatus["id"]) => providers?.find((p) => p.id === provider);
  const groups = PROVIDER_IDS.map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider],
    status: statusFor(provider),
    models: models.filter((m) => m.provider === provider),
  })).filter((g) => g.models.length > 0 || (g.status && g.status.state !== "ready"));

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <label htmlFor={id} className={label ? "mr-2 text-xs text-muted-foreground" : "sr-only"}>
        {label ?? "Provider and model"}
      </label>
      <div className="relative">
        {/* Real control: transparent, on top, first in DOM so `peer-*` can style the readout. */}
        <select
          id={id}
          name={name}
          value={current}
          disabled={isDisabled}
          onChange={(e) => onChange(e.target.value)}
          title={`${described.providerLabel} · ${described.label}${health !== "available" ? ` — ${HEALTH_LABELS[health]}` : ""}`}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        >
          {!known ? (
            // The stored model isn't in today's list (provider dropped it, or
            // its key was removed). Keep it visible so the user sees why.
            <option value={current}>
              {described.providerLabel} · {described.label} (not currently listed)
            </option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group.provider} label={group.label}>
              {group.models.length === 0 && group.status?.note ? (
                <option value={`__unavailable:${group.provider}`} disabled>
                  {group.label} — {group.status.note}
                </option>
              ) : null}
              {group.models.map((m) => (
                <option key={m.id} value={m.id} title={m.description}>
                  {group.label} · {m.label}
                  {m.health ? `  ${HEALTH_GLYPH[m.health]}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Visible readout */}
        <div
          aria-hidden="true"
          className={cn(
            "flex h-8 max-w-[260px] items-center gap-1.5 rounded-md border border-transparent py-1 pr-7 pl-2.5 text-xs font-medium text-muted-foreground transition-colors sm:max-w-[340px]",
            "peer-hover:border-border peer-hover:bg-surface peer-hover:text-foreground",
            "peer-focus-visible:border-border-strong peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
            isDisabled && "opacity-50",
          )}
        >
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", HEALTH_DOT_CLASS[known ? health : "unavailable"])} />
          <span className="shrink-0 text-subtle">{described.providerLabel}</span>
          <span className="shrink-0 text-subtle">·</span>
          <span className={cn("truncate", !known && "text-destructive/80")}>{described.label}</span>
          {health !== "available" ? (
            <span className="shrink-0 rounded-sm bg-raised px-1 py-px text-[10px] text-subtle">{HEALTH_LABELS[health]}</span>
          ) : null}
          <ChevronDown aria-hidden="true" className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-subtle" />
        </div>
      </div>
    </div>
  );
}
