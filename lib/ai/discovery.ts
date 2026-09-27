import "server-only";
import { getModelHealth, isRestricted } from "@/lib/ai/health";
import { CLOUDFLARE_FREE_MODELS, GEMINI_FREE_MODELS, GEMMA_FREE_MODELS, ZAI_FREE_MODELS, freeTierConfirmed, hasZeroPricing, RESTRICTED_MODEL_IDS } from "@/lib/ai/free-policy";
import { getEnabledProviders, getProviderConfig } from "@/lib/ai/providers";
import { qualifyModelId } from "@/lib/ai/models";
import type { ModelOption, ProviderId } from "@/lib/ai/types";

export const OPENROUTER_FREE_ROUTER_ID = "openrouter/free";
const TTL = 120_000;
const cache = new Map<ProviderId, { expires: number; models: ModelOption[] }>();
const pending = new Map<ProviderId, Promise<ModelOption[]>>();

export async function getAvailableModels(): Promise<ModelOption[]> {
  const lists = await Promise.all(getEnabledProviders().map(modelsFor));
  return lists.flat().filter(m => !isRestricted(m.id) && !RESTRICTED_MODEL_IDS.has(m.id)).map(m => ({ ...m, health: getModelHealth(m.id) }));
}
export async function getAvailableModel(id: string): Promise<ModelOption | undefined> {
  const qualified = qualifyModelId(id);
  return (await getAvailableModels()).find(model => model.id === qualified);
}
export function invalidateModelCache(provider?: ProviderId) {
  if (provider) cache.delete(provider); else cache.clear();
}
function label(id: string) {
  return id.split("/").at(-1)!.replace(/:free$/, "").split(/[-_]/).map(s => /^(gpt|oss|llm|ai)$/i.test(s) || /^\d/.test(s) ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
function option(provider: ProviderId, model: string, name?: string, context?: number, output?: number): ModelOption {
  return { id: provider + ":" + model, provider, model, label: name || label(model), contextLength: context, maxOutputTokens: output,
    description: context ? Math.round(context / 1000) + "K context" : "Free-tier usage limits apply" };
}
function router(): ModelOption {
  return { ...option("openrouter", OPENROUTER_FREE_ROUTER_ID, "Free models · Auto"), description: "Routes your request to an available free model." };
}
async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!response.ok) throw new Error("Model discovery HTTP " + response.status);
  return response.json();
}
async function modelsFor(provider: ProviderId): Promise<ModelOption[]> {
  const previous = cache.get(provider);
  if (previous && previous.expires > Date.now()) return previous.models;
  const running = pending.get(provider);
  if (running) return running;
  const request = discover(provider).then(models => {
    cache.set(provider, { models, expires: Date.now() + TTL });
    return models;
  }).catch(() => {
    // Fail closed on catalog errors: never keep stale prices or unknown models.
    // The documented free router is the only safe catalog-independent fallback.
    const models = provider === "openrouter" ? [router()] : [];
    cache.set(provider, { models, expires: Date.now() + 15_000 });
    return models;
  }).finally(() => pending.delete(provider));
  pending.set(provider, request);
  return request;
}

interface RemoteModel {
  capabilities?: { completion_chat?: boolean }; archived?: boolean; max_context_length?: number;
  providers?: { status?: string; context_length?: number }[];
  id?: string; name?: string; displayName?: string; active?: boolean;
  context_window?: number; context_length?: number; inputTokenLimit?: number;
  max_completion_tokens?: number; outputTokenLimit?: number;
  input_modalities?: string[]; output_modalities?: string[];
  supportedGenerationMethods?: string[];
  pricing?: Record<string, unknown>;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number | null };
}
const NON_CHAT = /guard|safeguard|moderation|content-safety|embed|whisper|orpheus|tts|audio|speech|lyria|compound/i;
async function discover(provider: ProviderId): Promise<ModelOption[]> {
  const config = getProviderConfig(provider);
  if (!config) return [];
  if (provider === "gemini") {
    const all: RemoteModel[] = [];
    let pageToken = "";
    for (let page = 0; page < 5; page++) {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = await fetchJson(url.toString(), { "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() }) as { models?: RemoteModel[]; nextPageToken?: string };
      all.push(...(body.models ?? []));
      if (!body.nextPageToken) break;
      pageToken = body.nextPageToken;
    }
    return all.filter(m => m.name && ((freeTierConfirmed("gemini") ? GEMINI_FREE_MODELS : GEMMA_FREE_MODELS) as readonly string[]).includes(m.name.replace(/^models\//, "")) && m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => option(provider, m.name!.replace(/^models\//, ""), m.displayName, m.inputTokenLimit, m.outputTokenLimit));
  }
  if (config.kind !== "openai-compatible") return [];
  const headers: Record<string, string> = config.apiKey ? { Authorization: "Bearer " + config.apiKey } : {};
  if (provider === "zai") return ZAI_FREE_MODELS.map(m => option(provider, m));
  if (provider === "cloudflare") return CLOUDFLARE_FREE_MODELS.map(m => option(provider, m));
  if (provider === "ollama") {
    // Only chat-capable models are exposed, not local embedding models.
    const root = config.baseUrl.replace(/\/v1$/, "");
    const body = await fetchJson(root + "/api/tags") as { models?: { name?: string }[] };
    const checks = await Promise.all((body.models ?? []).filter(m => m.name && !NON_CHAT.test(m.name)).map(async m => {
      try {
        const res = await fetch(root + "/api/show", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m.name }), signal: AbortSignal.timeout(4000) });
        const detail = await res.json() as { capabilities?: string[] };
        return res.ok && detail.capabilities?.includes("completion") ? option(provider, m.name!) : null;
      } catch { return null; }
    }));
    return checks.filter((m): m is ModelOption => m !== null);
  }
  const body = await fetchJson(config.baseUrl + "/models", headers) as { data?: RemoteModel[] };
  const chat = (body.data ?? []).filter(m => typeof m.id === "string" && m.active !== false && m.archived !== true && !NON_CHAT.test(m.id) &&
    (provider !== "mistral" || m.capabilities?.completion_chat === true) &&
    (provider !== "huggingface" || m.providers?.some(p => p.status === "live")) &&
    (m.input_modalities ?? m.architecture?.input_modalities ?? ["text"]).includes("text") &&
    (m.output_modalities ?? m.architecture?.output_modalities ?? ["text"]).includes("text"));
  const filtered = provider === "openrouter" ? chat.filter(m => hasZeroPricing(m.pricing)) : chat;
  const models = filtered.filter(m => m.id !== OPENROUTER_FREE_ROUTER_ID).map(m => option(provider, m.id!, m.name?.replace(/\s*\(free\)\s*$/i, ""), m.context_window ?? m.context_length ?? m.max_context_length ?? m.providers?.find(p => p.status === "live")?.context_length, m.max_completion_tokens ?? m.top_provider?.max_completion_tokens ?? undefined)).sort((a,b) => a.label.localeCompare(b.label));
  if (provider === "huggingface") for (const model of models) model.description = "$0.10 monthly free credit shared across models; stops when exhausted.";
  if (provider === "mistral") for (const model of models) model.description = "Included monthly Free-mode allowance; stops when exhausted.";
  return provider === "openrouter" ? [router(), ...models] : models;
}
