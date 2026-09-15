"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "@/components/chat/message-bubble";
import type { ChatMessage } from "@/lib/chat/types";

interface MessageListProps {
  messages: ChatMessage[];
  isBusy: boolean;
  emptyState: React.ReactNode;
}

/** How close to the bottom (px) the user must be for auto-scroll to stay engaged. */
const STICK_THRESHOLD = 64;

export function MessageList({ messages, isBusy, emptyState }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
  };

  const last = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [last?.id, last?.content]);

  // Jump to the bottom on first paint of a loaded conversation.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  if (messages.length === 0) {
    return <div className="flex flex-1 items-center justify-center overflow-y-auto px-6">{emptyState}</div>;
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role="log"
      aria-label="Conversation"
      aria-busy={isBusy}
      className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-8 pb-6 sm:px-6">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isBusy && index === messages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
