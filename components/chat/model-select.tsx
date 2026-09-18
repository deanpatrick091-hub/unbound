"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { describeModel, groupByProvider, qualifyModelId } from "@/lib/ai/models";
import type { ModelOption } from "@/lib/ai/types";
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
 * Native <select> under a custom skin: keyboard/screen-reader behaviour for
 * free, zero JS, and it matches the OS picker on mobile. Options are grouped
 * by provider so the provider *is* the choice, not a separate control.
 */
export function ModelSelect({ value, onChange, models, disabled, className, label, name }: ModelSelectProps) {
  const id = useId();
  const current = qualifyModelId(value);
  const groups = groupByProvider(models);
  const known = models.some((m) => m.id === current);
  const described = describeModel(current, models);

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <label htmlFor={id} className={label ? "mr-2 text-xs text-muted-foreground" : "sr-only"}>
        {label ?? "Provider and model"}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={current}
          disabled={disabled || models.length === 0}
          onChange={(e) => onChange(e.target.value)}
          title={`${described.providerLabel} · ${described.label}`}
          className="peer h-8 max-w-[220px] cursor-pointer appearance-none truncate rounded-md border border-transparent bg-transparent py-1 pr-7 pl-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-border hover:bg-surface hover:text-foreground focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[280px]"
        >
          {!known ? (
            // The conversation's stored model isn't servable right now (key
            // removed, Ollama offline). Keep it visible so the user sees why.
            <option value={current} className="bg-raised text-foreground">
              {described.providerLabel} · {described.label} (unavailable)
            </option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group.provider} label={group.label} className="bg-raised text-muted-foreground">
              {group.models.map((m) => (
                <option key={m.id} value={m.id} title={m.description} className="bg-raised text-foreground">
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-subtle peer-hover:text-muted-foreground"
        />
      </div>
    </div>
  );
}
