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
  if (error instanceof ApiError) return { type: "error", ...mapApiError(error) };
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
      return { code: "rate_limited", message: "The AI service is busy. Please wait a moment and try again." };
    case 400:
    case 401:
    case 403:
      return {
        code: "upstream_error",
        message: "The AI service rejected the request. Check the server API key and model configuration.",
      };
    case 404:
      return { code: "upstream_error", message: "The selected AI model is not available right now." };
    case 503:
      return { code: "upstream_error", message: "The AI model is under heavy load. Please try again shortly." };
    default:
      return { code: "upstream_error", message: "The AI service is temporarily unavailable. Please try again." };
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
  let completed = false;

  try {
    const client = getGeminiClient();
    const stream = await client.models.generateContentStream({
      model,
      contents: toGeminiContents(model.startsWith("gemma-") ? turns.map((turn, index) => index === 0 ? { ...turn, content: systemInstruction + "\n\n" + turn.content } : turn) : turns),
      config: {
        // Gemma does not support Gemini's separate systemInstruction field.
        ...(model.startsWith("gemma-") ? {} : { systemInstruction }),
        abortSignal: signal, temperature, maxOutputTokens: options.maxTokens ?? 4096,
      },
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
      if (finishReason) completed = true;
      if (finishReason === FinishReason.MAX_TOKENS) {
        yield { type: "error", code: "upstream_error", message: "The model reached its response limit. Ask for a shorter answer or continue from the last section." };
        return;
      }
      if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
        yield {
          type: "error",
          code: "content_blocked",
          message: "The response was stopped by the AI service's content policy.",
        };
        return;
      }
    }

    if (!completed) { yield { type: "error", code: "network_error", message: "The response ended early. Please try again." }; return; }
    yield { type: "done", usage };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.error("[gemini] stream failed", error instanceof ApiError ? error.status : "upstream");
    }
    yield signal?.aborted ? { type: "error", code: "aborted", message: "The request was cancelled." } : toErrorEvent(error);
  }
}
