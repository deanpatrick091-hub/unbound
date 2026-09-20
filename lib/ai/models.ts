/**
 * Model catalog and id helpers. Client-safe: contains no secrets and no
 * knowledge of which providers are configured — the server decides that.
 */
import { PROVIDER_IDS, PROVIDER_LABELS, type ModelOption, type ProviderId } from "@/lib/ai/types";

export const DEFAULT_MODEL_ID = "gemini:gemini-3.6-flash";

/** Qualifies a bare (legacy) model id. Bare ids were always Gemini. */
export function qualifyModelId(id: string): string {
  return id.includes(":") && isProviderId(id.slice(0, id.indexOf(":"))) ? id : `gemini:${id}`;
}

export function parseModelId(id: string): { provider: ProviderId; model: string } {
  const qualified = qualifyModelId(id);
  const sep = qualified.indexOf(":");
  return { provider: qualified.slice(0, sep) as ProviderId, model: qualified.slice(sep + 1) };
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Provider model ids: letters, digits, and the punctuation providers actually use. */
const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,127}$/;

/**
 * Structural validation only. Whether the provider is configured — and
 * whether it actually serves the model — is checked server-side.
 */
export function isWellFormedModelId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 160) return false;
  const { provider, model } = parseModelId(value);
  return isProviderId(provider) && MODEL_NAME_PATTERN.test(model);
}

function option(provider: ProviderId, model: string, label: string, description?: string): ModelOption {
  return { id: `${provider}:${model}`, provider, model, label, description };
}

/**
 * Curated catalog. Gemini ids are verified against this key; Groq and Ollama
 * are also discovered live (see lib/ai/discovery.ts); OpenRouter and Hugging
 * Face entries are their free-tier models as listed on 2026-09-20. OpenRouter
 * rotates its ":free" tier, so expect to refresh these occasionally.
 */
export const MODEL_CATALOG: readonly ModelOption[] = [
  option("gemini", "gemini-3.6-flash", "Gemini 3.6 Flash", "Fast, balanced — the default."),
  option("gemini", "gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "Lightest and quickest."),
  option("gemini", "gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)", "Deeper reasoning; slower."),

  option("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B", "Strong general model, very fast on Groq."),
  option("groq", "llama-3.1-8b-instant", "Llama 3.1 8B Instant", "Smallest and fastest."),
  option("groq", "openai/gpt-oss-120b", "GPT-OSS 120B", "OpenAI open-weight reasoning model."),
  option("groq", "openai/gpt-oss-20b", "GPT-OSS 20B", "Lighter open-weight model."),

  option("openrouter", "nvidia/nemotron-3.5-lightning:free", "Nemotron 3.5 Lightning", "1M context, free tier."),
  option("openrouter", "google/gemma-4-31b-it:free", "Gemma 4 31B", "Google open model, free tier."),
  option("openrouter", "qwen/qwen3.8-27b:free", "Qwen 3.8 27B", "Free tier."),
  option("openrouter", "nvidia/nemotron-3-super-120b-a12b:free", "Nemotron 3 Super 120B", "Free tier."),
  option("openrouter", "z-ai/glm-5.2:free", "GLM 5.2", "Free tier."),

  option("huggingface", "meta-llama/Llama-3.1-8B-Instruct", "Llama 3.1 8B Instruct", "Widely available."),
  option("huggingface", "Qwen/Qwen3-8B", "Qwen3 8B", "Compact and capable."),
  option("huggingface", "openai/gpt-oss-20b", "GPT-OSS 20B", "Open-weight reasoning model."),
  option("huggingface", "deepseek-ai/DeepSeek-V4-Flash-0731", "DeepSeek V4 Flash", "Large, fast."),
  option("huggingface", "google/gemma-4-26B-A4B-it", "Gemma 4 26B", "Google open model."),
];

/** Legacy alias kept for existing imports; prefer MODEL_CATALOG. */
export const MODEL_OPTIONS = MODEL_CATALOG;

export function findModel(id: string, models: readonly ModelOption[] = MODEL_CATALOG): ModelOption | undefined {
  const qualified = qualifyModelId(id);
  return models.find((m) => m.id === qualified);
}

/** Human label for any id, even one not in the catalog (e.g. a local Ollama tag). */
export function describeModel(id: string, models: readonly ModelOption[] = MODEL_CATALOG): {
  provider: ProviderId;
  providerLabel: string;
  label: string;
} {
  const { provider, model } = parseModelId(id);
  const known = findModel(id, models);
  return { provider, providerLabel: PROVIDER_LABELS[provider], label: known?.label ?? model };
}

/** True when the id is structurally valid (provider known, name well-formed). */
export function isAllowedModel(id: unknown): id is string {
  return isWellFormedModelId(id);
}

/** Returns a well-formed, qualified id: the requested one if valid, else the fallback. */
export function resolveModel(requested: unknown, fallback: string = DEFAULT_MODEL_ID): string {
  if (isWellFormedModelId(requested)) return qualifyModelId(requested);
  return isWellFormedModelId(fallback) ? qualifyModelId(fallback) : DEFAULT_MODEL_ID;
}

/** Groups a model list by provider, preserving catalog order. */
export function groupByProvider(models: readonly ModelOption[]): Array<{ provider: ProviderId; label: string; models: ModelOption[] }> {
  return PROVIDER_IDS.map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider],
    models: models.filter((m) => m.provider === provider),
  })).filter((g) => g.models.length > 0);
}
