"use client";

import { useCallback } from "react";
import { AlertCircle, ArrowUpRight, CloudOff, Lightbulb, PenLine, RotateCcw, X, Zap } from "lucide-react";

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
        <span className="truncate text-xs text-subtle" title={`${described.providerLabel} · ${described.label}`}>
          <span className="text-muted-foreground">{described.providerLabel}</span> · {described.label}
        </span>
      </div>

      <MessageList
        messages={chat.messages}
        isBusy={chat.isBusy}
        emptyState={<EmptyState name={user.displayName} disabled={chat.isBusy || !models.length} onPrompt={text => void chat.sendMessage(text)} />}
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

function EmptyState({ name, onPrompt, disabled }: { name: string | null; onPrompt: (text: string) => void; disabled: boolean }) {
  const first = name?.trim().split(/\s+/)[0];
  return <div className="chat-welcome w-full max-w-2xl animate-rise-in">
    <p className="text-sm text-muted-foreground">{first ? "Hello, " + first + "." : "Your space to think."}</p>
    <h2 className="mt-4 text-3xl font-medium leading-[1.15] tracking-[-0.045em] sm:text-4xl">What’s on your mind?</h2>
    <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">Ask, explore, or make something new.</p>
    <div className="mt-9 grid gap-3 sm:grid-cols-3">
      {[{ icon: Lightbulb, title: "Find an idea", text: "Help me brainstorm a useful project I could build this weekend. Ask about my interests first." }, { icon: PenLine, title: "Make it clearer", text: "Help me improve something I have written. Ask me to paste the text and tell you who it is for." }, { icon: Zap, title: "Think it through", text: "Help me work through a decision. Ask me what I am deciding and what matters most." }].map(item => <button key={item.title} type="button" className="prompt-card disabled:opacity-50" disabled={disabled} onClick={() => onPrompt(item.text)}><item.icon size={20} className="mb-5 text-brand" /><span className="flex items-center justify-between gap-2 text-sm">{item.title}<ArrowUpRight size={15} /></span></button>)}
    </div>
  </div>;
}
