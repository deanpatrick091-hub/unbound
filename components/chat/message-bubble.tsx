import { memo } from "react";

import { Markdown } from "@/components/markdown";
import type { ChatMessage } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
  /** True while this assistant message is still being generated. */
  isStreaming?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isPending = !isUser && isStreaming && message.content.length === 0;

  if (isUser) {
    return (
      <article aria-label="You" className="flex justify-end animate-rise-in">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-raised px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words sm:max-w-[72%]">
          {message.content}
        </div>
      </article>
    );
  }

  return (
    <article aria-label="UNBOUND" className="flex gap-3 animate-fade-in">
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full bg-brand",
          isStreaming && "animate-pulse-soft shadow-[0_0_10px_var(--brand)]",
        )}
      />
      <div className="min-w-0 flex-1">
        {isPending ? (
          <TypingIndicator />
        ) : (
          <Markdown content={message.content} />
        )}
        {message.status === "cancelled" ? (
          <p className="mt-2 text-[11px] text-subtle">Stopped</p>
        ) : message.status === "error" ? (
          <p className="mt-2 text-[11px] text-destructive/80">Response interrupted</p>
        ) : null}
      </div>
    </article>
  );
});

function TypingIndicator() {
  return (
    <span className="flex h-6 items-center gap-1" role="status" aria-label="UNBOUND is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="size-1.5 rounded-full bg-muted-foreground animate-pulse-soft"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </span>
  );
}
