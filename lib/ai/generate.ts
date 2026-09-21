import "server-only";

import { getAvailableModels, invalidateModelCache, OPENROUTER_FREE_ROUTER_ID } from "@/lib/ai/discovery";
import { parseModelId } from "@/lib/ai/models";
import { streamOpenAICompatible } from "@/lib/ai/openai-compatible";
import { getProviderConfig, providerNotConfiguredMessage } from "@/lib/ai/providers";
import { PROVIDER_LABELS, type GenerationEvent, type GenerationOptions } from "@/lib/ai/types";
import { streamGemini } from "@/lib/gemini/stream";

/**
 * Provider-agnostic entry point for a single model. Routes a qualified model
 * id to the right adapter; every adapter yields the same GenerationEvents.
 */
export async function* streamGeneration(
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const { provider, model } = parseModelId(options.model);
  const config = getProviderConfig(provider);

  if (!config) {
    yield { type: "error", code: "not_configured", message: providerNotConfiguredMessage(provider) };
    return;
  }

  if (config.kind === "gemini") {
    yield* streamGemini({ ...options, model });
    return;
  }

  yield* streamOpenAICompatible(config, PROVIDER_LABELS[provider], model, {
    ...options,
    // A 404 means the live catalogue has moved on; drop the cached list so
    // the picker stops offering the model.
    onModelUnavailable: () => invalidateModelCache(provider),
  });
}

/** Total attempts per request, including the model the user chose. */
const MAX_FALLBACK_ATTEMPTS = 3;

function isOpenRouterFree(qualifiedId: string): boolean {
  const { provider, model } = parseModelId(qualifiedId);
  return provider === "openrouter" && (model === OPENROUTER_FREE_ROUTER_ID || model.endsWith(":free"));
}

/**
 * Ordered alternatives for a rate-limited OpenRouter free model: the free
 * router first (it routes around busy models itself), then the other free
 * models currently listed by OpenRouter, excluding anything already tried.
 */
async function openRouterFallbacks(tried: Set<string>): Promise<string[]> {
  const free = (await getAvailableModels()).filter((m) => m.provider === "openrouter" && isOpenRouterFree(m.id));
  const router = free.find((m) => m.model === OPENROUTER_FREE_ROUTER_ID);
  const ordered = [...(router ? [router] : []), ...free.filter((m) => m.model !== OPENROUTER_FREE_ROUTER_ID)];
  return ordered.map((m) => m.id).filter((id) => !tried.has(id));
}

/**
 * streamGeneration with automatic fallback for OpenRouter's shared free tier.
 *
 * If the chosen free model is rate-limited *before any text has streamed*,
 * the request is retried on another configured free model (at most
 * MAX_FALLBACK_ATTEMPTS models in total). A `fallback` event announces each
 * switch so callers can record which model actually answered. Once text has
 * started, no retry happens — a partial answer from one model is never
 * spliced with another's.
 */
export async function* streamWithFallback(
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const tried = new Set<string>();
  let current = options.model;

  for (let attempt = 1; ; attempt++) {
    tried.add(current);
    let produced = false;
    let rateLimited: Extract<GenerationEvent, { type: "error" }> | null = null;

    for await (const event of streamGeneration({ ...options, model: current })) {
      if (event.type === "error" && event.code === "rate_limited" && !produced) {
        rateLimited = event;
        break;
      }
      if (event.type === "text") produced = true;
      yield event;
    }

    if (!rateLimited) return;

    const canFallback = isOpenRouterFree(current) && attempt < MAX_FALLBACK_ATTEMPTS && !options.signal?.aborted;
    const next = canFallback ? (await openRouterFallbacks(tried))[0] : undefined;
    if (!next) {
      yield rateLimited;
      return;
    }

    console.warn(`[fallback] ${current} rate-limited; retrying with ${next} (attempt ${attempt + 1}/${MAX_FALLBACK_ATTEMPTS})`);
    yield { type: "fallback", from: current, to: next, reason: rateLimited.message };
    current = next;
  }
}

export type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
