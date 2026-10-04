"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ChatErrorCode } from "@/lib/chat/types";
import {
  emptyMembers,
  INITIAL_COUNCIL_STATE as INITIAL,
  type CouncilMemberState,
  type CouncilMembers,
  type CouncilState,
} from "@/lib/council/state";
import type { CouncilRole, CouncilStreamEvent } from "@/lib/council/types";
import { readErrorBody, readNdjson } from "@/lib/stream/ndjson";

export type { CouncilMemberState, CouncilMembers, CouncilState };

export interface UseCouncilOptions {
  initial?: Partial<CouncilState>;
  onSessionCreated?: (session: { id: string; title: string }) => void;
  onFinished?: () => void;
}

export function useCouncil(options: UseCouncilOptions = {}) {
  const router = useRouter();
  const [state, setState] = useState<CouncilState>({ ...INITIAL, ...options.initial });
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const isRunning = state.status === "running";

  const patchMember = useCallback((role: CouncilRole, patch: Partial<CouncilMemberState>) => {
    setState((prev) => ({
      ...prev,
      members: {
        ...prev.members,
        [role]: {
          ...prev.members[role],
          ...patch,
          text: patch.text !== undefined ? patch.text : prev.members[role].text,
        },
      },
    }));
  }, []);

  const appendMember = useCallback((role: CouncilRole, delta: string) => {
    setState((prev) => ({
      ...prev,
      members: {
        ...prev.members,
        [role]: { ...prev.members[role], text: prev.members[role].text + delta, status: "streaming" },
      },
    }));
  }, []);

  const submit = useCallback(
    async (question: string, model?: string, seatModels?:Record<string,string>) => {
      const trimmed = question.trim();
      if (!trimmed || isRunning) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL,
        question: trimmed,
        model: model ?? null,
        phase: "perspectives",
        status: "running",
        members: emptyMembers(),
      });

      const fail = (code: ChatErrorCode, message: string) =>
        setState((prev) => ({ ...prev, status: "error", phase: "finished", error: { code, message } }));

      try {
        const response = await fetch("/api/council", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, model, seatModels }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const err = await readErrorBody(response);
          if (response.status === 401) {
            router.push("/login");
            return;
          }
          fail(err.code as ChatErrorCode, err.message);
          return;
        }

        for await (const event of readNdjson<CouncilStreamEvent>(response.body)) {
          if (controller.signal.aborted) return;
          switch (event.type) {
            case "session":
              setState((prev) => ({ ...prev, sessionId: event.sessionId, model: event.model }));
              // Only persisted sessions get a URL and a sidebar entry.
              if (event.persisted) {
                optionsRef.current.onSessionCreated?.({ id: event.sessionId, title: event.title });
              }
              break;
            case "phase":
              setState((prev) => ({ ...prev, phase: event.phase }));
              if (event.phase === "judge") patchMember("judge", { status: "streaming" });
              break;
            case "member_model":
              patchMember(event.role,{model:event.model});
              break;
            case "delta":
              appendMember(event.role, event.text);
              break;
            case "member_done":
              patchMember(event.role, { status: event.status, message: event.message });
              break;
            case "error":
              fail(event.code, event.message);
              return;
            case "done":
              setState((prev) => ({ ...prev, status: event.status, phase: "finished" }));
              optionsRef.current.onFinished?.();
              return;
          }
        }
        fail("network_error", "The connection was interrupted before the Council finished.");
      } catch {
        if (controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            status: "cancelled",
            phase: "finished",
            members: Object.fromEntries(
              Object.entries(prev.members).map(([role, m]) => [
                role,
                m.status === "streaming" || m.status === "pending" ? { ...m, status: "cancelled" } : m,
              ]),
            ) as CouncilMembers,
          }));
          optionsRef.current.onFinished?.();
          return;
        }
        fail("network_error", "Could not reach the server. Check your connection and try again.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [appendMember, isRunning, patchMember, router],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  return { state, isRunning, submit, stop, reset };
}
