"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ChatErrorCode,
  ChatMessage,
  ChatRequestBody,
  ChatStreamEvent,
} from "@/lib/chat/types";
import { createId, readErrorBody, readNdjson } from "@/lib/stream/ndjson";

export type ChatStatus = "idle" | "submitting" | "streaming" | "error";

export interface ChatError {
  code: ChatErrorCode;
  message: string;
}

export interface UseChatOptions {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  model: string;
  /** Fired once when the server creates the conversation for this screen. */
  onConversationCreated?: (conversation: { id: string; title: string }) => void;
  /** Fired after any completed turn (to refresh lists that show recency). */
  onTurnComplete?: () => void;
}

export interface UseChatResult {
  conversationId: string | null;
  messages: ChatMessage[];
  status: ChatStatus;
  error: ChatError | null;
  isBusy: boolean;
  model: string;
  setModel: (model: string) => void;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  clearError: () => void;
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: createId(), role, content, createdAt: Date.now() };
}

export function useChat(options: UseChatOptions): UseChatResult {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(options.conversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<ChatError | null>(null);
  const [model, setModelState] = useState(options.model);

  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<string | null>(options.conversationId);
  const messagesRef = useRef<ChatMessage[]>(options.initialMessages);
  const modelRef = useRef(options.model);
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const isBusy = status === "submitting" || status === "streaming";

  const commit = useCallback((update: (prev: ChatMessage[]) => ChatMessage[]) => {
    const next = update(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const setModel = useCallback((next: string) => {
    modelRef.current = next;
    setModelState(next);
  }, []);

  const run = useCallback(
    async (body: ChatRequestBody, optimisticUser?: ChatMessage) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistant = createMessage("assistant", "");
      commit((prev) => (optimisticUser ? [...prev, optimisticUser, assistant] : [...prev, assistant]));
      setError(null);
      setStatus("submitting");

      let text = "";
      const finishWith = (nextError: ChatError) => {
        commit((prev) =>
          text.length === 0
            ? prev.filter((m) => m.id !== assistant.id)
            : prev.map((m) => (m.id === assistant.id ? { ...m, status: "error" } : m)),
        );
        setError(nextError);
        setStatus("error");
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const err = await readErrorBody(response);
          if (response.status === 401) {
            router.push("/login");
            return;
          }
          finishWith({ code: err.code as ChatErrorCode, message: err.message });
          return;
        }

        for await (const event of readNdjson<ChatStreamEvent>(response.body)) {
          if (controller.signal.aborted) return;
          switch (event.type) {
            case "meta":
              if (!conversationRef.current) {
                conversationRef.current = event.conversationId;
                setConversationId(event.conversationId);
                callbacksRef.current.onConversationCreated?.({
                  id: event.conversationId,
                  title: event.title ?? "New chat",
                });
              }
              break;
            case "text":
              text += event.text;
              commit((prev) => prev.map((m) => (m.id === assistant.id ? { ...m, content: text } : m)));
              setStatus("streaming");
              break;
            case "error":
              finishWith({ code: event.code, message: event.message });
              return;
            case "done":
              commit((prev) =>
                prev.map((m) =>
                  m.id === assistant.id ? { ...m, id: event.assistantMessageId ?? m.id, status: "complete" } : m,
                ),
              );
              setStatus("idle");
              callbacksRef.current.onTurnComplete?.();
              return;
          }
        }

        finishWith({
          code: "network_error",
          message: "The connection was interrupted before the response finished.",
        });
      } catch {
        if (controller.signal.aborted) {
          commit((prev) =>
            text.length === 0
              ? prev.filter((m) => m.id !== assistant.id)
              : prev.map((m) => (m.id === assistant.id ? { ...m, status: "cancelled" } : m)),
          );
          setStatus("idle");
          callbacksRef.current.onTurnComplete?.();
          return;
        }
        finishWith({
          code: "network_error",
          message: "Could not reach the server. Check your connection and try again.",
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [commit, router],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isBusy) return;
      const user = createMessage("user", trimmed);
      await run(
        {
          conversationId: conversationRef.current ?? undefined,
          content: trimmed,
          model: modelRef.current,
        },
        user,
      );
    },
    [isBusy, run],
  );

  const retry = useCallback(async () => {
    if (isBusy) return;
    const history = messagesRef.current;
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    // Drop the failed assistant bubble; the server keeps its own record.
    commit((prev) => {
      const idx = prev.lastIndexOf(lastUser);
      return idx === -1 ? prev : prev.slice(0, idx + 1);
    });

    if (conversationRef.current) {
      await run({ conversationId: conversationRef.current, model: modelRef.current, retry: true });
    } else {
      commit((prev) => prev.filter((m) => m.id !== lastUser.id));
      await run({ content: lastUser.content, model: modelRef.current }, lastUser);
    }
  }, [commit, isBusy, run]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clearError = useCallback(() => {
    setError(null);
    setStatus((prev) => (prev === "error" ? "idle" : prev));
  }, []);

  return {
    conversationId,
    messages,
    status,
    error,
    isBusy,
    model,
    setModel,
    sendMessage,
    stop,
    retry,
    clearError,
  };
}
