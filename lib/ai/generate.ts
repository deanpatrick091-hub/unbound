import "server-only";

import { getAvailableModels, invalidateModelCache, OPENROUTER_FREE_ROUTER_ID } from "@/lib/ai/discovery";
import {
  isFallbackCandidate,
  markHealthy,
  markProviderQuotaExhausted,
  markRateLimited,
  markRestricted,
  markSoftFailure,
} from "@/lib/ai/health";
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
    // A policy 403 hides the model until the health entry expires.
    onModelRestricted: (reason) => markRestricted(options.model, reason),
  });
}

/** Total attempts per request, including the model the user chose. */
const MAX_FALLBACK_ATTEMPTS = 3;
/** If a model hasn't produced its first token by then, give another one a turn. */
const FIRST_TOKEN_TIMEOUT_MS = 30_000;

function isOpenRouterFree(qualifiedId: string): boolean {
  const { provider, model } = parseModelId(qualifiedId);
  return provider === "openrouter" && (model === OPENROUTER_FREE_ROUTER_ID || model.endsWith(":free"));
}

/**
 * Ordered alternatives for a struggling OpenRouter free model: the free
 * router first (it routes around busy models itself), then the other free
 * models currently listed, excluding anything tried or known-unhealthy.
 */
async function openRouterFallbacks(tried: Set<string>): Promise<string[]> {
  const free = (await getAvailableModels()).filter((m) => m.provider === "openrouter" && isOpenRouterFree(m.id));
  const router = free.find((m) => m.model === OPENROUTER_FREE_ROUTER_ID);
  const ordered = [...(router ? [router] : []), ...free.filter((m) => m.model !== OPENROUTER_FREE_ROUTER_ID)];
  return ordered.map((m) => m.id).filter((id) => !tried.has(id) && isFallbackCandidate(id));
}

type ErrorEvent = Extract<GenerationEvent, { type: "error" }>;

/** Why an attempt is being abandoned before it produced anything. */
type Setback = { kind: "rate_limited" | "quota" | "restricted" | "timeout" | "empty"; event: ErrorEvent };

/**
 * streamGeneration with resilience for OpenRouter's shared free tier.
 *
 * An attempt is abandoned — and, for OpenRouter free models, retried on
 * another free model — when, *before any text has streamed*, it is
 * rate-limited (429), refused by policy (403), silent for
 * FIRST_TOKEN_TIMEOUT_MS, or finishes with an empty completion. At most
 * MAX_FALLBACK_ATTEMPTS models are tried. Each outcome updates the model's
 * health so the picker can hint and later fallbacks can skip it; health
 * entries expire on their own. Once text has started, no retry happens.
 */
export async function* streamWithFallback(
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const tried = new Set<string>();
  let current = options.model;

  for (let attempt = 1; ; attempt++) {
    tried.add(current);

    // Per-attempt abort so a first-token timeout cancels only this model.
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    options.signal?.addEventListener("abort", abortAttempt, { once: true });
    let firstToken = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (!firstToken) {
        timedOut = true;
        attemptController.abort();
      }
    }, FIRST_TOKEN_TIMEOUT_MS);

    let setback: Setback | null = null;
    let doneEvent: Extract<GenerationEvent, { type: "done" }> | null = null;

    try {
      for await (const event of streamGeneration({ ...options, model: current, signal: attemptController.signal })) {
        if (event.type === "text" && event.text.length > 0) {
          if (!firstToken) {
            firstToken = true;
            clearTimeout(timer);
          }
          yield event;
          continue;
        }
        if (event.type === "error") {
          if (!firstToken && event.code === "rate_limited") setback = { kind: "rate_limited", event };
          else if (!firstToken && event.code === "quota_exhausted") setback = { kind: "quota", event };
          else if (!firstToken && event.code === "model_restricted") setback = { kind: "restricted", event };
          else if (event.code === "aborted" && timedOut && !options.signal?.aborted) {
            setback = {
              kind: "timeout",
              event: {
                type: "error",
                code: "upstream_error",
                message: `No response from the model within ${FIRST_TOKEN_TIMEOUT_MS / 1000} seconds.`,
              },
            };
          } else yield event;
          break;
        }
        if (event.type === "done") {
          if (!firstToken) {
            setback = {
              kind: "empty",
              event: { type: "error", code: "upstream_error", message: "The model returned an empty response." },
            };
          } else doneEvent = event;
          break;
        }
        yield event;
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortAttempt);
    }

    if (doneEvent) {
      markHealthy(current);
      yield doneEvent;
      return;
    }
    if (!setback) return; // error already yielded, or user cancelled

    // Record what happened to this model.
    switch (setback.kind) {
      case "rate_limited":
        markRateLimited(current, "Rate limited a moment ago");
        break;
      case "quota":
        // Account-wide: every model of this provider is affected, so there is
        // nothing to fall back to within it. Surface the message immediately.
        markProviderQuotaExhausted(parseModelId(current).provider, "Daily free quota used up");
        yield setback.event;
        return;
      case "restricted":
        break; // markRestricted already ran inside the adapter
      case "timeout":
        markSoftFailure(current, "No response within 30 s");
        break;
      case "empty":
        markSoftFailure(current, "Returned an empty response");
        break;
    }

    const canFallback = isOpenRouterFree(current) && attempt < MAX_FALLBACK_ATTEMPTS && !options.signal?.aborted;
    const next = canFallback ? (await openRouterFallbacks(tried))[0] : undefined;
    if (!next) {
      yield setback.event;
      return;
    }

    console.warn(`[fallback] ${current}: ${setback.kind}; retrying with ${next} (attempt ${attempt + 1}/${MAX_FALLBACK_ATTEMPTS})`);
    yield { type: "fallback", from: current, to: next, reason: setback.event.message };
    current = next;
  }
}

export type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
