/**
 * Provider-agnostic generation types. Safe for client import — no secrets.
 */
import type { ChatErrorCode, ChatRole, TokenUsage } from "@/lib/chat/types";

import type {AdditionalChatId} from "@/lib/ai/additional-chat";
export type ProviderId = AdditionalChatId | "kilo" | "gemini" | "groq" | "cerebras" | "openrouter" | "cloudflare" | "mistral" | "huggingface" | "zai" | "ollama";

export const PROVIDER_IDS: readonly ProviderId[] = ["kilo", "sambanova", "cohere", "openrouter", "gemini", "groq", "cloudflare", "mistral", "huggingface", "zai", "ollama", "cerebras"];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  kilo: "Kilo",
  sambanova: "SambaNova",
  cohere: "Cohere",
  gemini: "Google Gemini",
  groq: "Groq",
  cerebras: "Cerebras",
  openrouter: "OpenRouter",
  cloudflare: "Cloudflare",
  mistral: "Mistral",
  huggingface: "Hugging Face",
  zai: "Z.ai",
  ollama: "Ollama (local)",
};

export type ModelHealthState = "available" | "busy" | "rate_limited" | "restricted" | "unavailable";

export interface ModelHealth {
  state: ModelHealthState;
  reason?: string;
}

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
  /** Recent health, as observed by this server (absent = available). */
  health?: ModelHealth;
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
  /** Called when the provider refuses this model for this client (403 policy). */
  onModelRestricted?: (reason: string) => void;
}

/** Events yielded by any provider stream. Always ends with `done` or `error`. */
export type GenerationEvent =
  | { type: "text"; text: string }
  | { type: "error"; code: ChatErrorCode; message: string }
  | { type: "done"; usage?: TokenUsage }
  /** Emitted by the fallback layer when it switches to another model before any text was produced. */
  | { type: "fallback"; from: string; to: string; reason: string };
