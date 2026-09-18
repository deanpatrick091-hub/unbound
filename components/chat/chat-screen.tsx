"use client";

import { useCallback } from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";

import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { useShell } from "@/components/shell/shell-context";
import { useChat, type ChatStatus } from "@/hooks/use-chat";
import { describeModel } from "@/lib/ai/models";
import type { ChatMessage } from "@/lib/chat/types";

interface ChatScreenProps {
  conversationId: string | null;
  title: string | null;
  initialMessages: ChatMessage[];
  model: string;
}

const STATUS_ANNOUNCEMENTS: Record<ChatStatus, string> = {
  idle: "",
  submitting: "UNBOUND is thinking.",
  streaming: "UNBOUND is responding.",
  error: "The last request failed.",
};

export function ChatScreen({ conversationId, title, initialMessages, model }: ChatScreenProps) {
  const { user, models, upsertConversation, refreshConversations } = useShell();

  const onConversationCreated = useCallback(
    (created: { id: string; title: string }) => {
      // Shallow URL update keeps the streaming component mounted; Next's
      // router syncs its state from history.replaceState.
      window.history.replaceState(null, "", `/c/${created.id}`);
      upsertConversation({ id: created.id, title: created.title, model, updated_at: new Date().toISOString() });
    },
    [model, upsertConversation],
  );

  const chat = useChat({
    conversationId,
    initialMessages,
    model,
    onConversationCreated,
    onTurnComplete: refreshConversations,
  });

  const activeTitle = title ?? (chat.conversationId ? "Chat" : null);
  const described = describeModel(chat.model, models);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden h-14 shrink-0 items-center justify-between border-b px-6 lg:flex">
        <h1 className="truncate text-sm font-medium text-foreground">{activeTitle ?? "New chat"}</h1>
        <span className="truncate text-xs text-subtle" title={`${described.providerLabel} · ${described.label}`}>
          <span className="text-muted-foreground">{described.providerLabel}</span> · {described.label}
        </span>
      </div>

      <MessageList
        messages={chat.messages}
        isBusy={chat.isBusy}
        emptyState={<EmptyState name={user.displayName} />}
      />

      <p role="status" className="sr-only">
        {STATUS_ANNOUNCEMENTS[chat.status]}
      </p>

      {chat.error ? (
        <div className="mx-auto w-full max-w-3xl px-3 pb-2 sm:px-6">
          <div
            role="alert"
            className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive animate-rise-in"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 basis-48">{chat.error.message}</p>
            <div className="ml-auto flex items-center gap-1">
              {chat.error.code !== "limit_reached" ? (
                <button
                  type="button"
                  onClick={() => void chat.retry()}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={chat.clearError}
                aria-label="Dismiss error"
                className="flex size-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Composer
        isBusy={chat.isBusy}
        model={chat.model}
        onModelChange={chat.setModel}
        onSend={(content) => void chat.sendMessage(content)}
        onStop={chat.stop}
        autoFocus={initialMessages.length === 0}
      />
    </div>
  );
}

function EmptyState({ name }: { name: string | null }) {
  const first = name?.trim().split(/\s+/)[0];
  return (
    <div className="max-w-md text-center animate-rise-in">
      <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">UNBOUND</p>
      <h2 className="mt-4 text-2xl font-medium tracking-tight text-foreground sm:text-[28px]">
        {first ? `What are we working on, ${first}?` : "What are we working on?"}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Ask a question, draft something, or think a problem through. For hard calls, convene the Council.
      </p>
    </div>
  );
}
