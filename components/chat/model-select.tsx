"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { MODEL_OPTIONS } from "@/lib/gemini/models";
import { cn } from "@/lib/utils";

interface ModelSelectProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  className?: string;
  /** Visible label text (defaults to a screen-reader-only label). */
  label?: string;
  name?: string;
}

/**
 * Native <select> under a custom skin: keyboard/screen-reader behaviour for
 * free, zero JS, and it matches the OS picker on mobile.
 */
export function ModelSelect({ value, onChange, disabled, className, label, name }: ModelSelectProps) {
  const id = useId();
  const current = MODEL_OPTIONS.find((m) => m.id === value) ?? MODEL_OPTIONS[0];

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <label htmlFor={id} className={label ? "mr-2 text-xs text-muted-foreground" : "sr-only"}>
        {label ?? "Model"}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={current.id}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          title={current.description}
          className="peer h-8 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent py-1 pr-7 pl-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-border hover:bg-surface hover:text-foreground focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id} className="bg-raised text-foreground">
              {m.label}
            </option>
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
