import "server-only";

import { getAvailableModels, invalidateModelCache, OPENROUTER_FREE_ROUTER_ID } from "@/lib/ai/discovery";
import {
  isModelUsable,
  markBusy,
  markHealthy,
  markRateLimited,
  markRestricted,
  markTimeout,
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
const MAX_FALLBACK_ATTEMPTS = 4;

/** How long a model may take to produce its first token before we move on. */
const FIRST_TOKEN_TIMEOUT_MS = 30_000;

/** When the same provider has nothing healthy left, try these in order. */
const CROSS_PROVIDER_ORDER: readonly ProviderId[] = ["gemini", "groq", "cerebras", "openrouter", "huggingface", "ollama"];

function isOpenRouterFree(qualifiedId: string): boolean {
  const { provider, model } = parseModelId(qualifiedId);
  return provider === "openrouter" && (model === OPENROUTER_FREE_ROUTER_ID || model.endsWith(":free"));
}

/** Only OpenRouter's free tier stands in for OpenRouter (never a paid model). */
function isCandidate(qualifiedId: string): boolean {
  const { provider } = parseModelId(qualifiedId);
  return provider !== "openrouter" || isOpenRouterFree(qualifiedId);
}

function orderWithinProvider(models: { id: string; model: string; contextLength?: number }[], provider: ProviderId): string[] {
  if (provider === "openrouter") {
    // The free router first: it routes around busy models itself.
    const router = models.find((m) => m.model === OPENROUTER_FREE_ROUTER_ID);
    return [...(router ? [router] : []), ...models.filter((m) => m.model !== OPENROUTER_FREE_ROUTER_ID)].map((m) => m.id);
  }
  // Elsewhere, prefer the most capable sibling (largest context) first.
  return [...models].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0)).map((m) => m.id);
}

/**
 * Ordered alternatives for a failing model:
 *   1. the best healthy, untried sibling from the same provider;
 *   2. the best healthy model from each other configured provider, in
 *      preference order (a provider-wide outage shouldn't eat every attempt);
 *   3. any remaining siblings.
 * Unhealthy models (rate-limited, busy, timed out, empty, restricted) are
 * skipped — their state is temporary and they stay in the picker.
 */
async function fallbackCandidates(original: string, tried: Set<string>): Promise<string[]> {
  const { provider } = parseModelId(original);
  const usable = (await getAvailableModels()).filter((m) => !tried.has(m.id) && isModelUsable(m.id) && isCandidate(m.id));

  const same = orderWithinProvider(usable.filter((m) => m.provider === provider), provider);
  const others = CROSS_PROVIDER_ORDER.filter((p) => p !== provider).flatMap((p) =>
    orderWithinProvider(usable.filter((m) => m.provider === p), p).slice(0, 1),
  );

  // Has a sibling already had its turn in this request? Then other providers go first.
  const siblingTried = [...tried].some((id) => id !== original && parseModelId(id).provider === provider);
  return siblingTried ? [...others, ...same] : [...same.slice(0, 1), ...others, ...same.slice(1)];
}

/** What the user reads when a switch happens or when we give up. */
const SWITCHING_SUFFIX = " UNBOUND is switching to another available model.";
const GIVE_UP_SUFFIX = " Please try again shortly or pick another model.";
const NO_FALLBACK_SUFFIX = " Automatic model switching is off.";

type AttemptOutcome =
  | { kind: "finished" }
  | {
      kind: "retry";
      /** Short, user-facing sentence explaining why this model was abandoned. */
      reason: string;
      /** What to emit if no alternative is available. */
      surface: GenerationEvent;
      /** True for outcomes where one more try on the same model is sensible. */
      retrySame: boolean;
    };

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
        markTimeout(model, `no first token within ${FIRST_TOKEN_TIMEOUT_MS / 1000}s`);
        console.warn(`[fallback] ${model}: no first token within ${FIRST_TOKEN_TIMEOUT_MS / 1000}s`);
        const message = "This model is taking too long to respond.";
        return { kind: "retry", reason: message, surface: { type: "error", code: "timeout", message }, retrySame: false };
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
          console.warn(`[fallback] ${model}: empty completion`);
          markUnavailable(model, "empty completion");
          const message = "This model returned an empty response.";
          return {
            kind: "retry",
            reason: message,
            surface: { type: "error", code: "upstream_error", message },
            retrySame: true,
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

        if (retryable) return { kind: "retry", reason: event.message, surface: event, retrySame: false };
        yield event;
        return { kind: "finished" };
      }

      yield event; // fallback events from nested layers (none today)
    }
  } finally {
    clear();
  }
}

function withSuffix(event: GenerationEvent, suffix: string): GenerationEvent {
  return event.type === "error" ? { ...event, message: event.message + suffix } : event;
}

/**
 * streamGeneration with automatic fallback.
 *
 * If the chosen model fails *before any text has streamed* — rate-limited,
 * restricted, overloaded (5xx / in-stream failure), silent for
 * FIRST_TOKEN_TIMEOUT_MS, or an empty completion — the request moves on:
 *   1. the same model once more, only for an empty completion;
 *   2. another healthy model from the same provider;
 *   3. a healthy model from another configured provider;
 * stopping after MAX_FALLBACK_ATTEMPTS attempts in total. Each switch is
 * announced with a `fallback` event so callers can record which model
 * answered. Once text has started, no retry happens. With
 * `allowFallback: false` the provider's own error is returned instead.
 */
export async function* streamWithFallback(
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const allowFallback = options.allowFallback !== false;
  const tried = new Set<string>();
  let current = options.model;
  let retriedSame = false;

  for (let attempt = 1; ; attempt++) {
    tried.add(current);
    const outcome = yield* runAttempt(options, current);
    if (outcome.kind === "finished") return;

    if (!allowFallback) {
      yield withSuffix(outcome.surface, NO_FALLBACK_SUFFIX);
      return;
    }
    if (attempt >= MAX_FALLBACK_ATTEMPTS || options.signal?.aborted) {
      yield withSuffix(outcome.surface, GIVE_UP_SUFFIX);
      return;
    }

    // Step 1: one more try on the same model when that's sensible.
    if (outcome.retrySame && !retriedSame) {
      retriedSame = true;
      console.warn(`[fallback] ${current}: ${outcome.reason} — retrying the same model once (attempt ${attempt + 1}/${MAX_FALLBACK_ATTEMPTS})`);
      continue;
    }

    // Steps 2–3: same provider, then other providers.
    const next = (await fallbackCandidates(options.model, tried))[0];
    if (!next) {
      yield withSuffix(outcome.surface, GIVE_UP_SUFFIX);
      return;
    }

    console.warn(`[fallback] ${current}: ${outcome.reason} — switching to ${next} (attempt ${attempt + 1}/${MAX_FALLBACK_ATTEMPTS})`);
    yield { type: "fallback", from: current, to: next, reason: outcome.reason + SWITCHING_SUFFIX };
    current = next;
  }
}

export type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
