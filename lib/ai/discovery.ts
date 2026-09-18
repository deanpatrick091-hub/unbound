import "server-only";

import { MODEL_CATALOG } from "@/lib/ai/models";
import { getEnabledProviders, getProviderConfig } from "@/lib/ai/providers";
import type { ModelOption, ProviderId } from "@/lib/ai/types";

/**
 * Builds the list of models the current server can actually serve:
 * the curated catalog filtered to enabled providers, plus live discovery for
 * providers whose catalogues are small and local (Groq, Ollama).
 * Results are cached in-process briefly so the app layout stays fast.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 2_500;

interface CacheEntry {
  expires: number;
  models: ModelOption[];
}

const cache = new Map<ProviderId, CacheEntry>();

export async function getAvailableModels(): Promise<ModelOption[]> {
  const enabled = getEnabledProviders();
  const lists = await Promise.all(enabled.map((provider) => modelsFor(provider)));
  return lists.flat();
}

async function modelsFor(provider: ProviderId): Promise<ModelOption[]> {
  const curated = MODEL_CATALOG.filter((m) => m.provider === provider);
  if (provider !== "groq" && provider !== "ollama") return curated;

  const cached = cache.get(provider);
  if (cached && cached.expires > Date.now()) return cached.models;

  let discovered: ModelOption[] = [];
  try {
    discovered = provider === "groq" ? await discoverGroq() : await discoverOllama();
  } catch (error) {
    console.warn(`[models] ${provider} discovery failed:`, error instanceof Error ? error.message : error);
  }

  // Discovery succeeded: keep curated entries the provider still serves (they
  // carry nicer labels), then append everything else it reports.
  // Discovery failed: fall back to the curated list so the provider stays usable.
  let models: ModelOption[];
  if (discovered.length === 0) {
    models = curated;
  } else {
    const live = new Set(discovered.map((m) => m.id));
    const keptCurated = curated.filter((m) => live.has(m.id));
    const curatedIds = new Set(keptCurated.map((m) => m.id));
    models = [...keptCurated, ...discovered.filter((m) => !curatedIds.has(m.id))];
  }

  cache.set(provider, { expires: Date.now() + CACHE_TTL_MS, models });
  return models;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function discoverGroq(): Promise<ModelOption[]> {
  const config = getProviderConfig("groq");
  if (!config || config.kind !== "openai-compatible" || !config.apiKey) return [];
  const body = (await fetchJson(`${config.baseUrl}/models`, { Authorization: `Bearer ${config.apiKey}` })) as {
    data?: Array<{ id?: string; active?: boolean }>;
  };
  return (body.data ?? [])
    .filter((m) => typeof m.id === "string" && m.active !== false && !/whisper|tts|guard|safeguard|orpheus|compound/i.test(m.id))
    .map((m) => ({ id: `groq:${m.id}`, provider: "groq" as const, model: m.id as string, label: m.id as string }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function discoverOllama(): Promise<ModelOption[]> {
  const config = getProviderConfig("ollama");
  if (!config || config.kind !== "openai-compatible") return [];
  const root = config.baseUrl.replace(/\/v1$/, "");
  const body = (await fetchJson(`${root}/api/tags`, {})) as { models?: Array<{ name?: string }> };
  return (body.models ?? [])
    .filter((m) => typeof m.name === "string")
    .map((m) => ({ id: `ollama:${m.name}`, provider: "ollama" as const, model: m.name as string, label: m.name as string }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
