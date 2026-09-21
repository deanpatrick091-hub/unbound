/**
 * Provider-agnostic generation types. Safe for client import — no secrets.
 */
import type { ChatErrorCode, ChatRole, TokenUsage } from "@/lib/chat/types";

export type ProviderId = "gemini" | "groq" | "cerebras" | "openrouter" | "huggingface" | "ollama";

export const PROVIDER_IDS: readonly ProviderId[] = ["gemini", "groq", "cerebras", "openrouter", "huggingface", "ollama"];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  cerebras: "Cerebras",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  ollama: "Ollama (local)",
};

/**
 * Temporary, in-memory health of a model as observed by this server.
 *  - available: no recent problems
 *  - busy: overloaded (5xx / in-stream provider failure)
 *  - rate_limited: returned 429 recently
 *  - timeout: produced no first token within the window recently
 *  - unavailable: returned empty completions recently
 *  - restricted: provider says the model can't be used from this client (403)
 * Every state expires; none removes a model from the picker.
 */
export type ModelHealthState = "available" | "busy" | "rate_limited" | "timeout" | "unavailable" | "restricted";

export const HEALTH_LABELS: Record<ModelHealthState, string> = {
  available: "Available",
  busy: "Busy",
  rate_limited: "Rate limited",
  timeout: "Timeout",
  unavailable: "Temporarily unavailable",
  restricted: "Restricted upstream",
};

/** Whether a provider can be used right now, and why not if it can't. */
export type ProviderState = "ready" | "missing_key" | "offline";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  state: ProviderState;
  /** Short user-facing note, e.g. "API key required" or "Local server offline". */
  note?: string;
}

export const PROVIDER_STATE_NOTES: Record<Exclude<ProviderState, "ready">, string> = {
  missing_key: "API key required",
  offline: "Local server offline",
};

/** A selectable model. `id` is the qualified `provider:model` form. */
export interface ModelOption {
  id: string;
  provider: ProviderId;
  /** The provider's own model identifier. */
  model: string;
  label: string;
  description?: string;
  /** Provider-reported output cap, when known. */
  maxOutputTokens?: number;
  contextLength?: number;
  /** Current health as last observed by the server (omitted = available). */
  health?: Exclude<ModelHealthState, "available">;
}

export interface GenerationTurn {
  role: ChatRole;
  content: string;
}

export interface GenerationOptions {
  /** Qualified model id (`provider:model`). Bare ids are treated as Gemini. */
  model: string;
  systemInstruction: string;
  turns: GenerationTurn[];
  signal?: AbortSignal;
  temperature?: number;
  /** Output budget hint; adapters clamp it to what the provider allows. */
  maxTokens?: number;
  /** Called when the provider reports the model no longer exists. */
  onModelUnavailable?: () => void;
  /**
   * Whether the fallback layer may switch models when the chosen one fails
   * before answering. Default true; false returns the provider's own error.
   */
  allowFallback?: boolean;
}

/** Events yielded by any provider stream. Always ends with `done` or `error`. */
export type GenerationEvent =
  | { type: "text"; text: string }
  | {
      type: "error";
      code: ChatErrorCode;
      message: string;
      /** HTTP status from the provider, when there was one. */
      status?: number;
      /** Provider-suggested wait before retrying, when it gave one. */
      retryAfterMs?: number;
    }
  | { type: "done"; usage?: TokenUsage }
  /** Emitted by the fallback layer when it switches to another model before any text was produced. */
  | { type: "fallback"; from: string; to: string; reason: string };
