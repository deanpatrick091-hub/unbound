"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";

import { ModelSelect } from "@/components/chat/model-select";
import { useShell } from "@/components/shell/shell-context";
import { CHAT_LIMITS } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

interface ComposerProps {
  isBusy: boolean;
  model: string;
  onModelChange: (model: string) => void;
  onSend: (content: string) => void;
  onStop: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  hint?: string;
}

export function Composer({
  isBusy,
  model,
  onModelChange,
  onSend,
  onStop,
  placeholder = "Message UNBOUND…",
  autoFocus = false,
  maxLength = CHAT_LIMITS.maxMessageLength,
  hint = "Enter to send · Shift+Enter for a new line",
}: ComposerProps) {
  const { models } = useShell();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelId = useId();
  const hintId = useId();

  const trimmed = value.trim();
  const isTooLong = trimmed.length > maxLength;
  const canSend = trimmed.length > 0 && !isBusy && !isTooLong && models.some(m => m.id === model);

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.focus();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  // Grow with content up to a cap; fall back gracefully where
  // field-sizing isn't supported.
  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <div
        className={cn(
          "composer-glass border transition-[border-color,box-shadow] duration-200",
          "focus-within:border-border-strong focus-within:shadow-[0_0_0_1px_var(--border-strong),0_12px_40px_-20px_rgba(0,0,0,0.8)]",
          isTooLong && "border-destructive/60",
        )}
      >
        <label id={labelId} htmlFor={`${labelId}-ta`} className="sr-only">
          Message
        </label>
        <textarea
          id={`${labelId}-ta`}
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck
          aria-describedby={hintId}
          aria-invalid={isTooLong || undefined}
          className="scrollbar-thin block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-subtle"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <ModelSelect value={model} onChange={onModelChange} models={models} disabled={isBusy} />
          <div className="flex items-center gap-2">
            <span
              className={cn("hidden text-[11px] tabular-nums sm:inline", isTooLong ? "text-destructive" : "text-subtle")}
              aria-hidden="true"
            >
              {trimmed.length > maxLength * 0.8 ? `${trimmed.length.toLocaleString()} / ${maxLength.toLocaleString()}` : ""}
            </span>
            {isBusy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="flex size-8 items-center justify-center rounded-md bg-raised text-foreground outline-none transition-colors hover:bg-border-strong focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground outline-none transition-[background-color,transform,opacity] hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      <p id={hintId} className="composer-hint mx-auto mt-2 w-fit rounded-full px-3 py-1 text-center text-[11px] text-subtle">
        {isTooLong ? (
          <span className="text-destructive" role="alert">
            Message is too long ({trimmed.length.toLocaleString()} / {maxLength.toLocaleString()} characters).
          </span>
        ) : (
          <>{models.length ? hint + " · AI can make mistakes" : "No free models are connected yet."}</>
        )}
      </p>
    </form>
  );
}
