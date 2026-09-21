import "server-only";

import { getAvailableModels, invalidateModelCache, OPENROUTER_FREE_ROUTER_ID } from "@/lib/ai/discovery";
import {
  isModelUsable,
  markBusy,
  markHealthy,
  markRateLimited,
  markRestricted,
  markUnavailable,
} from "@/lib/ai/health";
import { parseModelId } from "@/lib/ai/models";
import { streamOpenAICompatible } from "@/lib/ai/openai-compatible";
import { getProviderConfig, providerNotConfiguredMessage } from "@/lib/ai/providers";
import { PROVIDER_LABELS, type GenerationEvent, type GenerationOptions, type ProviderId } from "@/lib/ai/types";
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

// ---------------------------------------------------------------------------
// Fallback layer
// ---------------------------------------------------------------------------

/** Total attempts per request, including the model the user chose. */
const MAX_FALLBACK_ATTEMPTS = 3;

/** How long a model may take to produce its first token before we move on. */
const FIRST_TOKEN_TIMEOUT_MS = 30_000;

/** Providers whose models may stand in for each other. */
const FALLBACK_PROVIDERS: ReadonlySet<ProviderId> = new Set(["openrouter", "groq", "cerebras", "gemini"]);

function isOpenRouterFree(qualifiedId: string): boolean {
  const { provider, model } = parseModelId(qualifiedId);
  return provider === "openrouter" && (model === OPENROUTER_FREE_ROUTER_ID || model.endsWith(":free"));
}

function isFallbackEligible(qualifiedId: string): boolean {
  const { provider } = parseModelId(qualifiedId);
  if (!FALLBACK_PROVIDERS.has(provider)) return false;
  // On OpenRouter only the free tier stands in for the free tier.
  return provider !== "openrouter" || isOpenRouterFree(qualifiedId);
}

/**
 * Ordered alternatives for a failing model: healthy models from the same
 * provider that haven't been tried. For OpenRouter, the free router goes
 * first (it routes around busy models itself) and only free models qualify.
 */
async function fallbackCandidates(current: string, tried: Set<string>): Promise<string[]> {
  const { provider } = parseModelId(current);
  const same = (await getAvailableModels()).filter(
    (m) => m.provider === provider && !tried.has(m.id) && isModelUsable(m.id) && (provider !== "openrouter" || isOpenRouterFree(m.id)),
  );
  if (provider === "openrouter") {
    const router = same.find((m) => m.model === OPENROUTER_FREE_ROUTER_ID);
    return [...(router ? [router] : []), ...same.filter((m) => m.model !== OPENROUTER_FREE_ROUTER_ID)].map((m) => m.id);
  }
  // Elsewhere, prefer the most capable sibling (largest context) first.
  return [...same].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0)).map((m) => m.id);
}

type AttemptOutcome =
  | { kind: "finished" }
  | { kind: "retry"; reason: string; surface: GenerationEvent };

type ErrorEvent = Extract<GenerationEvent, { type: "error" }>;

/** Errors worth trying another model for — only ever before the first token. */
function classifyRetryable(event: ErrorEvent): "rate_limited" | "restricted" | "busy" | null {
  if (event.code === "rate_limited") return "rate_limited";
  if (event.code === "restricted") return "restricted";
  if (event.status !== undefined && event.status >= 500) return "busy";
  // An upstream failure inside the stream with no usable status (a starved
  // free-tier route, typically) — the model is busy; someone else can answer.
  if (event.code === "upstream_error" && event.status === undefined && /mid-stream/.test(event.message)) return "busy";
  return null;
}

/**
 * Runs one model attempt. Yields the events callers should see; returns
 * whether the request finished or should move to another model.
 */
async function* runAttempt(
  options: GenerationOptions,
  model: string,
): AsyncGenerator<GenerationEvent, AttemptOutcome, undefined> {
  const inner = new AbortController();
  const onOuterAbort = () => inner.abort();
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });
  if (options.signal?.aborted) inner.abort();

  const stream = streamGeneration({ ...options, model, signal: inner.signal });
  let produced = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const firstTokenTimeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), FIRST_TOKEN_TIMEOUT_MS);
  });
  const clear = () => {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  };

  try {
    while (true) {
      const step = produced
        ? await stream.next()
        : await Promise.race([stream.next(), firstTokenTimeout]);

      if ("timedOut" in step) {
        inner.abort();
        void stream.return(undefined).catch(() => undefined);
        markBusy(model, `no first token within ${FIRST_TOKEN_TIMEOUT_MS / 1000}s`);
        return {
          kind: "retry",
          reason: "The model didn't start responding in time.",
          surface: { type: "error", code: "timeout", message: "The model didn't start responding in time. Please try again." },
        };
      }

      if (step.done) return { kind: "finished" };
      const event = step.value;

      if (event.type === "text") {
        if (event.text.length > 0) {
          if (!produced) clear();
          produced = true;
          yield event;
        }
        continue;
      }

      if (event.type === "done") {
        if (!produced) {
          markUnavailable(model, "empty completion");
          return {
            kind: "retry",
            reason: "The model returned an empty response.",
            surface: event, // callers treat done-without-text as an empty reply
          };
        }
        markHealthy(model);
        yield event;
        return { kind: "finished" };
      }

      if (event.type === "error") {
        if (options.signal?.aborted || event.code === "aborted") {
          yield event;
          return { kind: "finished" };
        }
        const retryable = produced ? null : classifyRetryable(event);
        if (retryable === "rate_limited") markRateLimited(model, event.message, event.retryAfterMs);
        else if (retryable === "restricted") markRestricted(model, event.message);
        else if (retryable === "busy") markBusy(model, event.message);

        if (retryable) return { kind: "retry", reason: event.message, surface: event };
        yield event;
        return { kind: "finished" };
      }

      yield event; // fallback events from nested layers (none today)
    }
  } finally {
    clear();
  }
}

/**
 * streamGeneration with automatic fallback.
 *
 * If the chosen model is rate-limited, restricted, overloaded (5xx), silent
 * for FIRST_TOKEN_TIMEOUT_MS, or answers with an empty completion — all
 * *before any text has streamed* — the request is retried on another healthy
 * model from the same provider, at most MAX_FALLBACK_ATTEMPTS models in total.
 * Each switch is announced with a `fallback` event so callers can record
 * which model actually answered. Once text has started, no retry happens.
 */
export async function* streamWithFallback(
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const tried = new Set<string>();
  let current = options.model;

  for (let attempt = 1; ; attempt++) {
    tried.add(current);
    const outcome = yield* runAttempt(options, current);
    if (outcome.kind === "finished") return;

    const canFallback = isFallbackEligible(current) && attempt < MAX_FALLBACK_ATTEMPTS && !options.signal?.aborted;
    const next = canFallback ? (await fallbackCandidates(current, tried))[0] : undefined;
    if (!next) {
      yield outcome.surface;
      return;
    }

    console.warn(`[fallback] ${current}: ${outcome.reason} — retrying with ${next} (attempt ${attempt + 1}/${MAX_FALLBACK_ATTEMPTS})`);
    yield { type: "fallback", from: current, to: next, reason: outcome.reason };
    current = next;
  }
}

export type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
