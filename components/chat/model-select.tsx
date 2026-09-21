"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { describeModel, groupByProvider, qualifyModelId } from "@/lib/ai/models";
import { HEALTH_LABELS, type ModelOption } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

interface ModelSelectProps {
  value: string;
  onChange: (model: string) => void;
  /** Models the server can serve; grouped by provider in the picker. */
  models: readonly ModelOption[];
  disabled?: boolean;
  className?: string;
  /** Visible label text (defaults to a screen-reader-only label). */
  label?: string;
  name?: string;
}

/**
 * A native <select> (keyboard, screen readers, and the OS picker on mobile
 * all for free) laid invisibly over a styled "Provider · Model" readout, so
 * the closed control shows both parts — native selects only show the option
 * text, never its optgroup.
 */
export function ModelSelect({ value, onChange, models, disabled, className, label, name }: ModelSelectProps) {
  const id = useId();
  const current = qualifyModelId(value);
  const groups = groupByProvider(models);
  const selected = models.find((m) => m.id === current);
  const known = Boolean(selected);
  const described = describeModel(current, models);
  const isDisabled = disabled || models.length === 0;
  const healthSuffix = (m: ModelOption) => (m.health ? ` · ${HEALTH_LABELS[m.health]}` : "");

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
          title={`${described.providerLabel} · ${described.label}`}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        >
          {!known ? (
            // The conversation's stored model isn't servable right now (key
            // removed, provider dropped it). Keep it visible so the user sees why.
            <option value={current}>
              {described.providerLabel} · {described.label} (unavailable)
            </option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group.provider} label={group.label}>
              {group.models.map((m) => (
                <option key={m.id} value={m.id} title={m.description}>
                  {group.label} · {m.label}
                  {healthSuffix(m)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Visible readout */}
        <div
          aria-hidden="true"
          className={cn(
            "flex h-8 max-w-[240px] items-center gap-1.5 rounded-md border border-transparent py-1 pr-7 pl-2.5 text-xs font-medium text-muted-foreground transition-colors sm:max-w-[320px]",
            "peer-hover:border-border peer-hover:bg-surface peer-hover:text-foreground",
            "peer-focus-visible:border-border-strong peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
            isDisabled && "opacity-50",
          )}
        >
          <span className="shrink-0 text-subtle">{described.providerLabel}</span>
          <span className="shrink-0 text-subtle">·</span>
          <span className={cn("truncate", !known && "text-destructive/80")}>
            {described.label}
            {!known ? " (unavailable)" : ""}
          </span>
          {selected?.health ? (
            <span className="shrink-0 rounded-sm bg-raised px-1 py-px text-[10px] text-subtle">
              {HEALTH_LABELS[selected.health]}
            </span>
          ) : null}
          <ChevronDown aria-hidden="true" className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-subtle" />
        </div>
      </div>
    </div>
  );
}
