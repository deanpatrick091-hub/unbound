import "server-only";

import { getModelHealth, isModelRestricted } from "@/lib/ai/health";
import { MODEL_CATALOG } from "@/lib/ai/models";
import { getEnabledProviders, getProviderConfig } from "@/lib/ai/providers";
import type { ModelOption, ProviderId } from "@/lib/ai/types";

/**
 * Builds the list of models the current server can actually serve.
 *
 * Groq, Cerebras, OpenRouter and Ollama are discovered live from the
 * providers' own model endpoints and filtered structurally (modalities,
 * pricing, activity), so nothing here depends on remembering model ids.
 * Gemini and Hugging Face use the curated catalog. Results are cached
 * in-process briefly so the app layout stays fast; a failed discovery falls
 * back to the last good list.
 *
 * On every read the list is passed through the health store: models the
 * provider has declared restricted are removed, and temporary states
 * (busy / rate-limited / unavailable) are annotated for the picker.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 4_000;

/** OpenRouter's auto-routing endpoint over its free tier — a stable, documented id. */
export const OPENROUTER_FREE_ROUTER_ID = "openrouter/free";

interface CacheEntry {
  expires: number;
  models: ModelOption[];
}

const cache = new Map<ProviderId, CacheEntry>();

export async function getAvailableModels(): Promise<ModelOption[]> {
  const enabled = getEnabledProviders();
  const lists = await Promise.all(enabled.map((provider) => modelsFor(provider)));
  return lists.flat().filter((m) => !isModelRestricted(m.id)).map(withHealth);
}

/** Forces a fresh discovery next call (e.g. after a provider says a model is gone). */
export function invalidateModelCache(provider?: ProviderId): void {
  if (provider) cache.delete(provider);
  else cache.clear();
}

function withHealth(model: ModelOption): ModelOption {
  const { state } = getModelHealth(model.id);
  if (state === "available" || state === "restricted") {
    const { health: _drop, ...rest } = model;
    void _drop;
    return rest;
  }
  return { ...model, health: state };
}

async function modelsFor(provider: ProviderId): Promise<ModelOption[]> {
  const curated = MODEL_CATALOG.filter((m) => m.provider === provider);
  if (provider === "gemini" || provider === "huggingface") return curated;

  const cached = cache.get(provider);
  if (cached && cached.expires > Date.now()) return cached.models;

  try {
    const models = await discover(provider);
    cache.set(provider, { expires: Date.now() + CACHE_TTL_MS, models });
    return models;
  } catch (error) {
    console.warn(`[models] ${provider} discovery failed:`, error instanceof Error ? error.message : error);
    // Stale-while-error: keep serving the last good list if we have one.
    if (cached) return cached.models;
    // OpenRouter's router id is stable even when its catalogue can't be read.
    return provider === "openrouter" ? [openRouterRouterOption(200_000)] : [];
  }
}

function discover(provider: ProviderId): Promise<ModelOption[]> {
  switch (provider) {
    case "groq":
      return discoverGroq();
    case "cerebras":
      return discoverCerebras();
    case "openrouter":
      return discoverOpenRouter();
    case "ollama":
      return discoverOllama();
    default:
      return Promise.resolve([]);
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatContext(tokens: number | undefined): string {
  if (!tokens) return "";
  return tokens >= 1_000_000 ? `${Math.round(tokens / 100_000) / 10}M context` : `${Math.round(tokens / 1000)}K context`;
}

/** "openai/gpt-oss-120b" → "GPT OSS 120B", "qwen-3.8-27b" → "Qwen 3.8 27B". */
function prettifyId(id: string): string {
  const tail = id.split("/").pop() ?? id;
  return tail
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) || /^[a-z]{1,3}$/i.test(part) && part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

/** Classifier/guard/embedding models answer with labels or vectors, not prose. */
const NON_CHAT_ID = /guard|safeguard|moderation|embed|content-safety|whisper|tts|lyria|transcribe/i;

// ---------------------------------------------------------------------------
// Groq — https://api.groq.com/openai/v1/models (authenticated)
// ---------------------------------------------------------------------------

interface GroqModel {
  id?: string;
  name?: string;
  active?: boolean;
  context_window?: number;
  max_completion_tokens?: number;
  input_modalities?: string[];
  output_modalities?: string[];
}

async function discoverGroq(): Promise<ModelOption[]> {
  const config = getProviderConfig("groq");
  if (!config || config.kind !== "openai-compatible" || !config.apiKey) return [];
  const body = (await fetchJson(`${config.baseUrl}/models`, { Authorization: `Bearer ${config.apiKey}` })) as {
    data?: GroqModel[];
  };

  return (body.data ?? [])
    .filter(
      (m): m is GroqModel & { id: string } =>
        typeof m.id === "string" &&
        m.active !== false &&
        (m.input_modalities ?? ["text"]).includes("text") &&
        (m.output_modalities ?? ["text"]).includes("text") &&
        !NON_CHAT_ID.test(m.id),
    )
    .map((m) => ({
      id: `groq:${m.id}`,
      provider: "groq" as const,
      model: m.id,
      label: m.name?.trim() || prettifyId(m.id),
      description: formatContext(m.context_window),
      maxOutputTokens: m.max_completion_tokens,
      contextLength: m.context_window,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Cerebras — https://api.cerebras.ai/v1/models (authenticated)
// The list is minimal ({ id, object, created, owned_by }); every entry is a
// chat model, so only the generic non-chat filter applies.
// ---------------------------------------------------------------------------

interface CerebrasModel {
  id?: string;
  owned_by?: string;
}

async function discoverCerebras(): Promise<ModelOption[]> {
  const config = getProviderConfig("cerebras");
  if (!config || config.kind !== "openai-compatible" || !config.apiKey) return [];
  const body = (await fetchJson(`${config.baseUrl}/models`, { Authorization: `Bearer ${config.apiKey}` })) as {
    data?: CerebrasModel[];
  };

  return (body.data ?? [])
    .filter((m): m is CerebrasModel & { id: string } => typeof m.id === "string" && !NON_CHAT_ID.test(m.id))
    .map((m) => ({
      id: `cerebras:${m.id}`,
      provider: "cerebras" as const,
      model: m.id,
      label: prettifyId(m.id),
      description: m.owned_by ? `by ${m.owned_by}` : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// OpenRouter — https://openrouter.ai/api/v1/models (public)
// ---------------------------------------------------------------------------

interface OpenRouterModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { output_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number | null };
}

function isFree(m: OpenRouterModel): boolean {
  return Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0;
}

function openRouterRouterOption(contextLength: number): ModelOption {
  return {
    id: `openrouter:${OPENROUTER_FREE_ROUTER_ID}`,
    provider: "openrouter",
    model: OPENROUTER_FREE_ROUTER_ID,
    label: "Free Models Router (auto)",
    description: "Picks an available free model for you — most resilient to rate limits.",
    contextLength,
  };
}

async function discoverOpenRouter(): Promise<ModelOption[]> {
  const config = getProviderConfig("openrouter");
  if (!config || config.kind !== "openai-compatible") return [];
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body = (await fetchJson(`${config.baseUrl}/models`, headers)) as { data?: OpenRouterModel[] };

  const free = (body.data ?? []).filter(
    (m): m is OpenRouterModel & { id: string } =>
      typeof m.id === "string" &&
      isFree(m) &&
      (m.architecture?.output_modalities ?? ["text"]).every((o) => o === "text") &&
      !NON_CHAT_ID.test(m.id),
  );

  const router = free.find((m) => m.id === OPENROUTER_FREE_ROUTER_ID);
  const rest = free
    .filter((m) => m.id !== OPENROUTER_FREE_ROUTER_ID)
    .map((m) => ({
      id: `openrouter:${m.id}`,
      provider: "openrouter" as const,
      model: m.id,
      label: (m.name ?? m.id).replace(/\s*\(free\)\s*$/i, "").trim(),
      description: formatContext(m.context_length),
      maxOutputTokens: m.top_provider?.max_completion_tokens ?? undefined,
      contextLength: m.context_length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [openRouterRouterOption(router?.context_length ?? 200_000), ...rest];
}

// ---------------------------------------------------------------------------
// Ollama — {OLLAMA_BASE_URL}/api/tags (local)
// ---------------------------------------------------------------------------

async function discoverOllama(): Promise<ModelOption[]> {
  const config = getProviderConfig("ollama");
  if (!config || config.kind !== "openai-compatible") return [];
  const root = config.baseUrl.replace(/\/v1$/, "");
  const body = (await fetchJson(`${root}/api/tags`, {})) as { models?: Array<{ name?: string }> };
  return (body.models ?? [])
    .filter((m): m is { name: string } => typeof m.name === "string")
    .map((m) => ({ id: `ollama:${m.name}`, provider: "ollama" as const, model: m.name, label: m.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
