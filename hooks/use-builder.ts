"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ProjectSnapshot } from "@/lib/projects/types";
import { describeModel } from "@/lib/ai/models";
import type { BuildRequestBody, BuildStreamEvent, SiteFileName, SiteFiles } from "@/lib/build/types";
import type { ChatErrorCode, ChatMessage } from "@/lib/chat/types";
import { createId, readErrorBody, readNdjson } from "@/lib/stream/ndjson";

export type BuilderStatus = "idle" | "submitting" | "streaming" | "error";

export interface BuilderError {
  code: ChatErrorCode;
  message: string;
}

interface Snapshot {
  files: SiteFiles;
  messages: ChatMessage[];
  model: string;
  version: number;
}

const STORAGE_PREFIX = "unbound:builder:";

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: createId(), role, content, createdAt: Date.now() };
}

/**
 * State for the website-builder workspace: the conversation, the current
 * site files, and streaming from /api/build. The site autosaves to
 * localStorage (per user) so a refresh doesn't lose work.
 *
 * Must run client-only (the screen is loaded with `ssr: false`): the initial
 * state is read from localStorage synchronously in the useState initialisers.
 */
export function useBuilder(options: { userId: string; model: string; project: ProjectSnapshot }) {
  const router = useRouter();
  const storageKey = `${STORAGE_PREFIX}${options.userId}:${options.project.id}`;
  const [initial] = useState(() => ({files:options.project.files,messages:options.project.conversation,model:options.project.model,version:options.project.revision}));

  const [messages, setMessages] = useState<ChatMessage[]>(() => initial?.messages ?? []);
  const [files, setFiles] = useState<SiteFiles>(() => initial?.files ?? {});
  /** Increments whenever the site changes; the preview keys off it. */
  const [version, setVersion] = useState(() => initial?.version ?? 0);
  const [status, setStatus] = useState<BuilderStatus>("idle");
  const [error, setError] = useState<BuilderError | null>(null);
  const [model, setModelState] = useState(() => initial?.model || options.model);
  /** Which file is currently being written by the model, if any. */
  const [writing, setWriting] = useState<SiteFileName | null>(null);

  const revisionRef = useRef(options.project.revision);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>(initial?.messages ?? []);
  const filesRef = useRef<SiteFiles>(initial?.files ?? {});
  const modelRef = useRef(initial?.model || options.model);

  // Autosave — an effect syncing React state to an external store.
  useEffect(() => {
    try {
      const snapshot: Snapshot = { files, messages, model, version };
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {
      // Storage full or unavailable — the in-memory state still works.
    }
  }, [files, messages, model, version, storageKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const isBusy = status === "submitting" || status === "streaming";

  const commitMessages = useCallback((update: (prev: ChatMessage[]) => ChatMessage[]) => {
    const next = update(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const commitFiles = useCallback((update: (prev: SiteFiles) => SiteFiles) => {
    const next = update(filesRef.current);
    filesRef.current = next;
    setFiles(next);
    setVersion((v) => v + 1);
  }, []);

  const setModel = useCallback((next: string) => {
    modelRef.current = next;
    setModelState(next);
  }, []);

  const send = useCallback(
    async (instruction: string) => {
      const trimmed = instruction.trim();
      if (!trimmed || isBusy) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const user = createMessage("user", trimmed);
      const assistant = createMessage("assistant", "");
      // Context for the model: earlier instructions and its own summaries.
      const history = messagesRef.current
        .filter((m) => m.content.trim().length > 0 && m.status !== "error")
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      commitMessages((prev) => [...prev, user, assistant]);
      setError(null);
      setStatus("submitting");

      let text = "";
      let receivedFile = false;
      const stagedFiles:SiteFiles = {...filesRef.current};
      const fail = (nextError: BuilderError) => {
        commitMessages((prev) =>
          text.length === 0
            ? prev.filter((m) => m.id !== assistant.id)
            : prev.map((m) => (m.id === assistant.id ? { ...m, status: "error" } : m)),
        );
        setError(nextError);
        setStatus("error");
        setWriting(null);
      };

      const body: BuildRequestBody = { instruction: trimmed, files: filesRef.current, model: modelRef.current, history, projectId:options.project.id, revision:revisionRef.current };

      try {
        const response = await fetch("/api/build", {
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
          fail({ code: err.code as ChatErrorCode, message: err.message });
          return;
        }

        for await (const event of readNdjson<BuildStreamEvent>(response.body)) {
          if (controller.signal.aborted) return;
          switch (event.type) {
            case "meta":
              break;
            case "text":
              text += event.text;
              commitMessages((prev) => prev.map((m) => (m.id === assistant.id ? { ...m, content: text.trim() } : m)));
              setStatus("streaming");
              break;
            case "file_start":
              setWriting(event.name);
              setStatus("streaming");
              break;
            case "file":
              receivedFile = true;
              stagedFiles[event.name] = event.content;
              setWriting(null);
              break;
            case "model_switched": {
              modelRef.current = event.to;
              setModelState(event.to);
              const from = describeModel(event.from);
              const to = describeModel(event.to);
              const note = `${from.label} was unavailable — switching to ${to.providerLabel} · ${to.label}.`;
              commitMessages((prev) => prev.map((m) => (m.id === assistant.id ? { ...m, note } : m)));
              break;
            }
            case "error":
              fail({ code: event.code, message: event.message });
              return;
            case "done":
              if (!stagedFiles["index.html"]?.trim()) {
                fail({
                  code: "upstream_error",
                  message: "The model did not produce an HTML page to preview. Try another model or ask it to build a complete index.html page.",
                });
                return;
              }
              if(event.revision!==undefined)revisionRef.current=event.revision;
              commitFiles(()=>stagedFiles);
              commitMessages((prev) =>
                prev.map((m) =>
                  m.id === assistant.id
                    ? { ...m, content: text.trim() || (receivedFile ? "Done — the preview is updated." : m.content), status: "complete" }
                    : m,
                ),
              );
              setStatus("idle");
              setWriting(null);
              return true;
          }
        }
        fail({ code: "network_error", message: "The connection was interrupted before the build finished." });
      } catch {
        if (controller.signal.aborted) {
          commitMessages((prev) =>
            text.length === 0
              ? prev.filter((m) => m.id !== assistant.id)
              : prev.map((m) => (m.id === assistant.id ? { ...m, status: "cancelled" } : m)),
          );
          setStatus("idle");
          setWriting(null);
          return;
        }
        fail({ code: "network_error", message: "Could not reach the server. Check your connection and try again." });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [commitFiles, commitMessages, isBusy, router, options.project.id],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clearError = useCallback(() => {
    setError(null);
    setStatus((prev) => (prev === "error" ? "idle" : prev));
  }, []);

  /** Start over: clears the site and the conversation. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    messagesRef.current = [];
    filesRef.current = {};
    setMessages([]);
    setFiles({});
    setVersion((v) => v + 1);
    setError(null);
    setStatus("idle");
    setWriting(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return {
    messages,
    files,
    version,
    status,
    error,
    isBusy,
    writing,
    model,
    setModel,
    send,
    stop,
    clearError,
    reset,
    hasSite: Boolean(files["index.html"]),
  };
}

