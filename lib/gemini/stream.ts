import "server-only";

import { ApiError, FinishReason, type Content } from "@google/genai";

import type { GenerationEvent, GenerationOptions, GenerationTurn } from "@/lib/ai/types";
import type { ChatErrorCode, TokenUsage } from "@/lib/chat/types";
import { GeminiNotConfiguredError, getGeminiClient } from "@/lib/gemini/client";

export type { GenerationEvent, GenerationOptions, GenerationTurn };

/** Finish reasons that mean the model stopped for a content-policy reason. */
const BLOCKED_FINISH_REASONS: ReadonlySet<FinishReason> = new Set([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
]);

function toGeminiContents(turns: GenerationTurn[]): Content[] {
  return turns.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

/** Maps a thrown error to a safe, user-facing event. Never leaks internals. */
export function toErrorEvent(error: unknown): Extract<GenerationEvent, { type: "error" }> {
  if (error instanceof GeminiNotConfiguredError) {
    return {
      type: "error",
      code: "not_configured",
      message: "The AI service is not configured. Set GEMINI_API_KEY on the server.",
    };
  }
  if (error instanceof ApiError) return { type: "error", ...mapApiError(error), status: error.status };
  if (error instanceof Error && error.name === "AbortError") {
    return { type: "error", code: "aborted", message: "The request was cancelled." };
  }
  return {
    type: "error",
    code: "upstream_error",
    message: "The AI service returned an unexpected error. Please try again.",
  };
}

function mapApiError(error: ApiError): { code: ChatErrorCode; message: string } {
  switch (error.status) {
    case 429:
      return { code: "rate_limited", message: "This model is temporarily busy." };
    case 400:
    case 401:
    case 403:
      return { code: "upstream_error", message: "Google Gemini rejected this request. Check the server configuration." };
    case 404:
      return { code: "upstream_error", message: "This model is no longer available from its provider. Please pick another model." };
    case 503:
      return { code: "upstream_error", message: "Google Gemini is temporarily unavailable." };
    default:
      return { code: "upstream_error", message: "Google Gemini is temporarily unavailable." };
  }
}

/**
 * Streams one Gemini generation as events. Always terminates with `done`
 * (carrying token usage when Gemini reports it) or `error`.
 *
 * `options.model` is Gemini's bare model id (the provider prefix is stripped
 * by lib/ai/generate.ts).
 */
export async function* streamGemini(
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const { model, systemInstruction, turns, signal, temperature } = options;
  let usage: TokenUsage | undefined;

  try {
    const client = getGeminiClient();
    const stream = await client.models.generateContentStream({
      model,
      contents: toGeminiContents(turns),
      config: { systemInstruction, abortSignal: signal, temperature },
    });

    for await (const chunk of stream) {
      if (chunk.promptFeedback?.blockReason) {
        yield {
          type: "error",
          code: "content_blocked",
          message: "That request was blocked by the AI service's content policy.",
        };
        return;
      }

      const text = chunk.text;
      if (text) yield { type: "text", text };

      const meta = chunk.usageMetadata;
      if (meta) {
        usage = {
          promptTokens: meta.promptTokenCount ?? 0,
          completionTokens: meta.candidatesTokenCount ?? 0,
          totalTokens: meta.totalTokenCount ?? 0,
        };
      }

      const finishReason = chunk.candidates?.[0]?.finishReason;
      if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
        yield {
          type: "error",
          code: "content_blocked",
          message: "The response was stopped by the AI service's content policy.",
        };
        return;
      }
    }

    yield { type: "done", usage };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.error("[gemini] stream failed:", error);
    }
    yield toErrorEvent(error);
  }
}
