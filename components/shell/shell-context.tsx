"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { ModelOption } from "@/lib/ai/types";

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  updated_at: string;
}

export interface CouncilSummary {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export interface ShellUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

interface ShellContextValue {
  user: ShellUser;
  /** Models the server can serve right now (providers with keys configured). */
  models: ModelOption[];
  conversations: ConversationSummary[];
  councilSessions: CouncilSummary[];
  refreshConversations: () => Promise<void>;
  refreshCouncil: () => Promise<void>;
  /** Optimistic local updates so the sidebar reacts before the server does. */
  upsertConversation: (item: ConversationSummary) => void;
  renameConversationLocal: (id: string, title: string) => void;
  removeConversationLocal: (id: string) => void;
  removeCouncilLocal: (id: string) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

interface ShellProviderProps {
  user: ShellUser;
  models: ModelOption[];
  initialConversations: ConversationSummary[];
  initialCouncilSessions: CouncilSummary[];
  children: ReactNode;
}

export function ShellProvider({
  user,
  models: initialModels,
  initialConversations,
  initialCouncilSessions,
  children,
}: ShellProviderProps) {
  const [models, setModels] = useState(initialModels);
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json() as { models?: ModelOption[] };
        if (Array.isArray(body.models)) setModels(body.models);
      } catch { /* Keep the current catalog until connectivity recovers. */ }
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(timer); };
  }, []);
  const [conversations, setConversations] = useState(initialConversations);
  const [councilSessions, setCouncilSessions] = useState(initialCouncilSessions);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { conversations?: ConversationSummary[] };
      if (Array.isArray(body.conversations)) setConversations(body.conversations);
    } catch {
      // Keep the current list; the next mutation will retry.
    }
  }, []);

  const refreshCouncil = useCallback(async () => {
    try {
      const res = await fetch("/api/council", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { sessions?: CouncilSummary[] };
      if (Array.isArray(body.sessions)) setCouncilSessions(body.sessions);
    } catch {
      // ignore
    }
  }, []);

  const upsertConversation = useCallback((item: ConversationSummary) => {
    setConversations((prev) => [item, ...prev.filter((c) => c.id !== item.id)]);
  }, []);

  const renameConversationLocal = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const removeConversationLocal = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const removeCouncilLocal = useCallback((id: string) => {
    setCouncilSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      user,
      models,
      conversations,
      councilSessions,
      refreshConversations,
      refreshCouncil,
      upsertConversation,
      renameConversationLocal,
      removeConversationLocal,
      removeCouncilLocal,
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [
      user,
      models,
      conversations,
      councilSessions,
      refreshConversations,
      refreshCouncil,
      upsertConversation,
      renameConversationLocal,
      removeConversationLocal,
      removeCouncilLocal,
      mobileNavOpen,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <ShellProvider>.");
  return ctx;
}
