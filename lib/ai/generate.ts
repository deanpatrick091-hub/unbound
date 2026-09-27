import "server-only";
import { getAvailableModel, getAvailableModels, invalidateModelCache, OPENROUTER_FREE_ROUTER_ID } from "@/lib/ai/discovery";
import { isFallbackCandidate, markHealthy, markProviderQuotaExhausted, markRateLimited, markRestricted, markSoftFailure } from "@/lib/ai/health";
import { parseModelId, qualifyModelId } from "@/lib/ai/models";
import { streamOpenAICompatible } from "@/lib/ai/openai-compatible";
import { getProviderConfig, providerNotConfiguredMessage } from "@/lib/ai/providers";
import { PROVIDER_LABELS, type GenerationEvent, type GenerationOptions } from "@/lib/ai/types";
import { streamGemini } from "@/lib/gemini/stream";

export async function* streamGeneration(options: GenerationOptions): AsyncGenerator<GenerationEvent> {
  const { provider, model } = parseModelId(options.model);
  const config = getProviderConfig(provider);
  if (!config) { yield { type: "error", code: "not_configured", message: providerNotConfiguredMessage(provider) }; return; }
  const allowed = await getAvailableModel(options.model);
  if (!allowed) { yield { type: "error", code: "invalid_request", message: "Choose a model from the current free model library." }; return; }
  const bounded = { ...options, maxTokens: Math.min(options.maxTokens ?? 4096, allowed.maxOutputTokens ?? 16_384, 16_384) };
  if (config.kind === "gemini") { yield* streamGemini({ ...bounded, model }); return; }
  yield* streamOpenAICompatible(config, PROVIDER_LABELS[provider], model, {
    ...bounded,
    onModelUnavailable: () => { markRestricted(options.model, "No longer offered by this provider"); invalidateModelCache(provider); },
    onModelRestricted: reason => markRestricted(options.model, reason),
  });
}

/** Never changes providers silently, never retries after output, never uses paid models. */
export async function* streamWithFallback(options: GenerationOptions): AsyncGenerator<GenerationEvent> {
  const tried = new Set<string>();
  let current = qualifyModelId(options.model);
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), 52_000);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (options.signal?.aborted || deadline.signal.aborted) {
        yield { type: "error", code: options.signal?.aborted ? "aborted" : "upstream_error", message: options.signal?.aborted ? "The request was cancelled." : "The free model took too long. Please try again." }; return;
      }
      tried.add(current);
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, deadline.signal, ...(options.signal ? [options.signal] : [])]);
      let started = false;
      let error: Extract<GenerationEvent, { type: "error" }> | undefined;
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        for await (const event of streamGeneration({ ...options, model: current, signal })) {
          if (event.type === "text" && event.text) { started = true; clearTimeout(timer); yield event; }
          else if (event.type === "error") { error = event; break; }
          else if (event.type === "done") {
            if (started) { markHealthy(current); yield event; return; }
            error = { type: "error", code: "upstream_error", message: "The model returned no text. Try a different free model." }; break;
          }
        }
      } catch {
        error = { type: "error", code: "network_error", message: "The model connection was interrupted. Please try again." };
      } finally { clearTimeout(timer); controller.abort(); }
      if (options.signal?.aborted) { yield { type: "error", code: "aborted", message: "The request was cancelled." }; return; }
      error ??= { type: "error", code: "upstream_error", message: "The model ended without completing a response." };
      if (deadline.signal.aborted) { yield { type: "error", code: "upstream_error", message: "The request timed out. Try a different free model." }; return; }
      if (error.code === "aborted") error = { type: "error", code: "upstream_error", message: "The model did not start replying in time." };
      if (started || ["content_blocked", "invalid_request", "not_configured"].includes(error.code)) { yield error; return; }
      const provider = parseModelId(current).provider;
      if (error.code === "quota_exhausted") {
        markProviderQuotaExhausted(provider, "Free allowance reached; wait for the provider reset");
        yield error; return;
      }
      if (error.code === "rate_limited") markRateLimited(current);
      else if (error.code !== "model_restricted") markSoftFailure(current, "A recent request failed");
      const candidates = (await getAvailableModels()).filter(m => m.provider === provider && !tried.has(m.id) && isFallbackCandidate(m.id));
      candidates.sort((a,b) => Number(b.model === OPENROUTER_FREE_ROUTER_ID) - Number(a.model === OPENROUTER_FREE_ROUTER_ID));
      const next = candidates[0];
      if (!next || attempt === 2) { yield error; return; }
      yield { type: "fallback", from: current, to: next.id, reason: error.message };
      current = next.id;
    }
  } finally { clearTimeout(deadlineTimer); }
}
export type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
