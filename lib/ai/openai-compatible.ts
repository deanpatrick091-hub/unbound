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

/** Sent on every request so providers can budget output up front. */
const DEFAULT_MAX_TOKENS = 4096;

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
  error?: { message?: string; code?: string | number; metadata?: { raw?: string } };
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

  const buildBody = (maxTokens: number): string => {
    const body: Record<string, unknown> = {
      model,
      stream: true,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemInstruction },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
    };
    if (temperature !== undefined) body.temperature = temperature;
    if (config.supportsStreamUsage) body.stream_options = { include_usage: true };
    return JSON.stringify(body);
  };

  let maxTokens = Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  let response: Response;

  // One request, plus at most one retry when the provider tells us the
  // requested output budget is over its per-minute cap.
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: buildBody(maxTokens),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        yield { type: "error", code: "aborted", message: "The request was cancelled." };
        return;
      }
      console.error(`[${providerLabel}] request failed for ${model}:`, error instanceof Error ? error.message : error);
      yield {
        type: "error",
        code: "network_error",
        message: providerLabel === "Ollama (local)" ? "Ollama's local server is offline." : `Couldn't reach ${providerLabel}.`,
      };
      return;
    }

    if (response.ok && response.body) break;

    const detail = await safeErrorDetail(response);
    console.error(`[${providerLabel}] HTTP ${response.status} for ${model}: ${providerReason(detail) || "(no detail)"}`);

    const outputCap = attempt === 0 ? parseOutputTokenCap(detail) : null;
    if (response.status === 429 && outputCap && outputCap < maxTokens) {
      maxTokens = outputCap;
      continue;
    }

    // "Please try again in 2.1s": a short, provider-quoted wait is worth one retry.
    const waitMs = attempt === 0 ? parseRetryAfter(detail, response.headers.get("retry-after")) : null;
    if (response.status === 429 && waitMs !== null && waitMs <= MAX_AUTO_WAIT_MS && !signal?.aborted) {
      console.warn(`[${providerLabel}] rate-limited; retrying ${model} in ${Math.ceil(waitMs / 1000)}s`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, waitMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
      if (signal?.aborted) {
        yield { type: "error", code: "aborted", message: "The request was cancelled." };
        return;
      }
      continue;
    }

    // The provider says the model is gone: refresh the picker on the next render.
    if (response.status === 404 && options.onModelUnavailable) options.onModelUnavailable();

    yield {
      type: "error",
      ...mapHttpError(response.status, providerLabel, model, detail),
      status: response.status,
      retryAfterMs: waitMs ?? parseRetryAfter(detail, response.headers.get("retry-after")) ?? undefined,
    };
    return;
  }

  let usage: TokenUsage | undefined;

  try {
    for await (const data of readSse(response.body as ReadableStream<Uint8Array>)) {
      if (data === "[DONE]") break;

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        continue; // keep-alive or malformed line
      }

      if (chunk.error) {
        // OpenRouter and others report upstream failures inside the stream,
        // with the HTTP-style code in the payload. Surface it like a header.
        const reason = providerReason(JSON.stringify(chunk.error));
        console.error(`[${providerLabel}] in-stream error for ${model}: ${reason || "(no detail)"}`);
        const code = Number(chunk.error.code);
        const status = Number.isFinite(code) && code >= 400 && code <= 599 ? code : undefined;
        if (status === 429) {
          yield {
            type: "error",
            code: "rate_limited",
            status,
            message: "This model is temporarily busy.",
          };
          return;
        }
        yield {
          type: "error",
          code: "upstream_error",
          status,
          message: `${providerLabel} is temporarily unavailable.`,
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
    return (await response.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

/** Longest provider-quoted wait we'll absorb silently before surfacing the 429. */
const MAX_AUTO_WAIT_MS = 12_000;

/**
 * A 403 that is about the *model's* availability to this kind of client, not
 * about the key. Phrased generically so it isn't tied to any one provider or
 * model: "only available on/to/through/via …", "not available to …",
 * "requires approval", "restricted to …".
 */
function isRestrictionMessage(reason: string): boolean {
  return /only (?:available|accessible|offered) (?:on|to|through|via|for)|not available (?:to|for|through)|requires? (?:approval|allowlist|whitelist)|restricted to|approved (?:clients|apps|harness)|agentic harness/i.test(
    reason,
  );
}

/**
 * Reads a wait hint from a 429: the `Retry-After` header (seconds) or a
 * "try again in 2.145s" phrase in the body. Null when the provider gave none.
 */
function parseRetryAfter(detail: string, header: string | null): number | null {
  const fromHeader = header ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader * 1000);
  const match = detail.match(/try again in\s*([\d.]+)\s*(ms|s)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.ceil(match[2].toLowerCase() === "ms" ? value : value * 1000) + 250;
}

/** Groq: "... output tokens per minute (OTPM): Limit 1000, Requested 1454 ..." */
function parseOutputTokenCap(detail: string): number | null {
  if (!/output tokens/i.test(detail)) return null;
  const match = detail.match(/Limit\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Pulls the human-readable reason out of a provider error body, without
 * URLs, ids or anything that could carry account details.
 */
function providerReason(detail: string): string {
  let message = "";
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string; metadata?: { raw?: string } } | string };
    const err = parsed.error;
    if (typeof err === "string") message = err;
    else message = err?.metadata?.raw || err?.message || "";
    // OpenRouter wraps upstream JSON in metadata.raw; unwrap one level.
    if (message.trim().startsWith("{")) {
      const inner = JSON.parse(message) as { error?: { message?: string } | string; message?: string };
      message = (typeof inner.error === "string" ? inner.error : inner.error?.message) || inner.message || message;
    }
  } catch {
    message = detail;
  }
  return message
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(org|user|proj|sk|key)[_-][A-Za-z0-9_-]{6,}\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim()
    .slice(0, 240);
}

/**
 * User-facing messages. Deliberately non-technical: the provider's own
 * wording is logged server-side (see the console.error above) but not shown.
 */
function mapHttpError(
  status: number,
  providerLabel: string,
  model: string,
  detail: string,
): { code: ChatErrorCode; message: string } {
  const reason = providerReason(detail);
  void model;

  switch (status) {
    case 403:
      if (isRestrictionMessage(reason)) {
        return { code: "restricted", message: "This model is currently restricted by its upstream provider." };
      }
      return { code: "upstream_error", message: `${providerLabel} rejected this app's API key. Check the server configuration.` };
    case 401:
      return { code: "upstream_error", message: `${providerLabel} rejected this app's API key. Check the server configuration.` };
    case 402:
      return { code: "upstream_error", message: `${providerLabel} needs credits for this model. Please pick another model.` };
    case 404:
      return { code: "upstream_error", message: "This model is no longer available from its provider. Please pick another model." };
    case 400:
    case 422:
      return { code: "upstream_error", message: `${providerLabel} rejected this request for the selected model.` };
    case 413:
      return { code: "upstream_error", message: "This request is too large for this model's tier. Try a model with a larger limit." };
    case 429:
      return { code: "rate_limited", message: "This model is temporarily busy." };
    case 500:
    case 502:
    case 503:
    case 504:
      return { code: "upstream_error", message: `${providerLabel} is temporarily unavailable.` };
    default:
      return { code: "upstream_error", message: `${providerLabel} returned an unexpected error.` };
  }
}
