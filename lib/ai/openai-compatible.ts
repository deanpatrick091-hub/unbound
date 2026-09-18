import "server-only";

import type { OpenAICompatibleConfig } from "@/lib/ai/providers";
import type { GenerationEvent, GenerationOptions } from "@/lib/ai/types";
import type { ChatErrorCode, TokenUsage } from "@/lib/chat/types";

/**
 * Streaming client for the OpenAI-compatible chat completions protocol, which
 * Groq, OpenRouter, Hugging Face's router and Ollama all implement. Yields the
 * same GenerationEvents as the Gemini adapter so callers don't care which
 * provider answered.
 */

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  error?: { message?: string; code?: string | number };
}

const CONTENT_FILTER_REASONS = new Set(["content_filter"]);

export async function* streamOpenAICompatible(
  config: OpenAICompatibleConfig,
  providerLabel: string,
  model: string,
  options: GenerationOptions,
): AsyncGenerator<GenerationEvent, void, undefined> {
  const { systemInstruction, turns, signal, temperature } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...config.extraHeaders,
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const body: Record<string, unknown> = {
    model,
    stream: true,
    messages: [
      { role: "system", content: systemInstruction },
      ...turns.map((t) => ({ role: t.role, content: t.content })),
    ],
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (config.supportsStreamUsage) body.stream_options = { include_usage: true };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      yield { type: "error", code: "aborted", message: "The request was cancelled." };
      return;
    }
    console.error(`[${providerLabel}] request failed:`, error);
    yield {
      type: "error",
      code: "network_error",
      message: `Could not reach ${providerLabel}. ${providerLabel === "Ollama (local)" ? "Is Ollama running?" : "Please try again."}`,
    };
    return;
  }

  if (!response.ok || !response.body) {
    const detail = await safeErrorDetail(response);
    console.error(`[${providerLabel}] HTTP ${response.status}:`, detail);
    yield { type: "error", ...mapHttpError(response.status, providerLabel, detail) };
    return;
  }

  let usage: TokenUsage | undefined;

  try {
    for await (const data of readSse(response.body)) {
      if (data === "[DONE]") break;

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        continue; // keep-alive or malformed line
      }

      if (chunk.error) {
        yield {
          type: "error",
          code: "upstream_error",
          message: `${providerLabel} returned an error mid-stream. Please try again.`,
        };
        return;
      }

      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) yield { type: "text", text };

      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens:
            chunk.usage.total_tokens ??
            (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0),
        };
      }

      if (choice?.finish_reason && CONTENT_FILTER_REASONS.has(choice.finish_reason)) {
        yield {
          type: "error",
          code: "content_blocked",
          message: "The response was stopped by the provider's content policy.",
        };
        return;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      yield { type: "error", code: "aborted", message: "The request was cancelled." };
      return;
    }
    console.error(`[${providerLabel}] stream read failed:`, error);
    yield { type: "error", code: "network_error", message: `The connection to ${providerLabel} was interrupted.` };
    return;
  }

  yield { type: "done", usage };
}

/** Yields the `data:` payload of each SSE event. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, boundary).replace(/\r$/, "");
        buffer = buffer.slice(boundary + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

async function safeErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

function mapHttpError(
  status: number,
  providerLabel: string,
  detail: string,
): { code: ChatErrorCode; message: string } {
  switch (status) {
    case 401:
    case 403:
      return { code: "upstream_error", message: `${providerLabel} rejected the server's API key.` };
    case 404:
      return {
        code: "upstream_error",
        message: /model/i.test(detail)
          ? `${providerLabel} doesn't serve that model. Pick another model.`
          : `${providerLabel} returned 404. Check the model id.`,
      };
    case 400:
    case 422:
      return {
        code: "upstream_error",
        message: /model/i.test(detail)
          ? `${providerLabel} doesn't recognise that model id.`
          : `${providerLabel} rejected the request.`,
      };
    case 402:
      return { code: "upstream_error", message: `${providerLabel} reports no remaining credits for this model.` };
    case 429:
      return { code: "rate_limited", message: `${providerLabel} is rate-limiting requests. Please wait a moment.` };
    case 500:
    case 502:
    case 503:
    case 504:
      return { code: "upstream_error", message: `${providerLabel} is temporarily unavailable. Please try again.` };
    default:
      return { code: "upstream_error", message: `${providerLabel} returned an unexpected error (${status}).` };
  }
}
