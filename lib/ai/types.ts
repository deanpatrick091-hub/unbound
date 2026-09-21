/**
 * Provider-agnostic generation types. Safe for client import — no secrets.
 */
import type { ChatErrorCode, ChatRole, TokenUsage } from "@/lib/chat/types";

export type ProviderId = "gemini" | "groq" | "openrouter" | "huggingface" | "ollama";

export const PROVIDER_IDS: readonly ProviderId[] = ["gemini", "groq", "openrouter", "huggingface", "ollama"];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  ollama: "Ollama (local)",
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
}

/** Events yielded by any provider stream. Always ends with `done` or `error`. */
export type GenerationEvent =
  | { type: "text"; text: string }
  | { type: "error"; code: ChatErrorCode; message: string }
  | { type: "done"; usage?: TokenUsage }
  /** Emitted by the fallback layer when it switches to another model before any text was produced. */
  | { type: "fallback"; from: string; to: string; reason: string };
