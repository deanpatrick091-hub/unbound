import "server-only";

import { invalidateModelCache } from "@/lib/ai/discovery";
import { parseModelId } from "@/lib/ai/models";
import { streamOpenAICompatible } from "@/lib/ai/openai-compatible";
import { getProviderConfig, providerNotConfiguredMessage } from "@/lib/ai/providers";
import { PROVIDER_LABELS, type GenerationEvent, type GenerationOptions } from "@/lib/ai/types";
import { streamGemini } from "@/lib/gemini/stream";

/**
 * Provider-agnostic entry point. Routes a qualified model id to the right
 * adapter; every adapter yields the same GenerationEvents.
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

export type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
