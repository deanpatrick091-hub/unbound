"use client";

import { useCallback } from "react";
import { AlertCircle, CloudOff, RotateCcw, X } from "lucide-react";

import {PinButton} from "@/components/projects/pin-button";
import Link from "next/link";
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
  const { models, upsertConversation, refreshConversations } = useShell();

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
    model: models.some(m => m.id === model) ? model : models[0]?.id ?? model,
    onConversationCreated,
    onTurnComplete: refreshConversations,
  });

  const activeTitle = title ?? (chat.conversationId ? "Chat" : null);
  const described = describeModel(chat.model, models);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="chat-heading flex h-12 shrink-0 items-center justify-between gap-3 px-5 sm:px-7">
        <h1 className="truncate text-sm font-medium text-foreground">{activeTitle ?? "New chat"}</h1>
        {chat.conversationId&&<PinButton kind="chat" id={chat.conversationId}/>}
        <span className="truncate text-xs text-subtle" title={`${described.providerLabel} · ${described.label}`}>
          <span className="text-muted-foreground">{described.providerLabel}</span> · {described.label}
        </span>
      </div>

      <MessageList
        messages={chat.messages}
        isBusy={chat.isBusy}
        emptyState={<p className="text-sm text-subtle">Your space to think, explore, and create.</p>}
      />

      <p role="status" className="sr-only">
        {STATUS_ANNOUNCEMENTS[chat.status]}
      </p>

      {!chat.persisted ? (
        <div className="mx-auto w-full max-w-3xl px-3 pb-2 sm:px-6">
          <p role="status" className="flex items-center gap-2 text-[11px] text-subtle animate-fade-in">
            <CloudOff aria-hidden="true" className="size-3.5" />
            History isn&apos;t being saved right now — replies still work, but this thread won&apos;t appear in your
            sidebar.
          </p>
        </div>
      ) : null}

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

      {!chat.messages.length&&<div className="mx-auto mb-2 flex gap-4 text-xs text-muted-foreground"><Link href="/build">Build a website ↗</Link><Link href="/image-gen">Generate an image ↗</Link><Link href="/tools">Research ↗</Link></div>}
      <Composer
        isBusy={chat.isBusy}
        model={chat.model}
        onModelChange={chat.setModel}
        onSend={(content) => void chat.sendMessage(content)}
        onStop={chat.stop}
        suggestions={chat.messages.length?["Explain that further","Give me an example"]:["Explain something","Help me code","Plan an idea"]}
        autoFocus={initialMessages.length === 0}
      />
    </div>
  );
}
