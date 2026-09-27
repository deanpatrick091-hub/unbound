import "server-only";

import type { OpenAICompatibleConfig } from "@/lib/ai/providers";
import type { GenerationEvent, GenerationOptions } from "@/lib/ai/types";
import type { ChatErrorCode, TokenUsage } from "@/lib/chat/types";

/**
 * Streaming client for the OpenAI-compatible chat completions protocol, which
 * Groq, Cloudflare, OpenRouter and Ollama all implement. Yields the
 * same GenerationEvents as the Gemini adapter so callers don't care which
 * provider answered.
 */

/** Sent on every request so providers can budget output up front. */
const DEFAULT_MAX_TOKENS = 4096;

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | Array<{ type?: string; text?: string }> | null };
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
    if (config.zeroPriceOnly) body.provider = { max_price: { prompt: 0, completion: 0, request: 0, image: 0 }, allow_fallbacks: true };
    if (temperature !== undefined) body.temperature = temperature;
    if (config.supportsStreamUsage) body.stream_options = { include_usage: true };
    return JSON.stringify(body);
  };

  let maxTokens = Math.max(1, Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, 16_384));
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
      console.error(`[${providerLabel}] request failed`);
      yield {
        type: "error",
        code: "network_error",
        message: `Could not reach ${providerLabel}. ${providerLabel === "Ollama (local)" ? "Is Ollama running?" : "Please try again."}`,
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
        const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, waitMs);
        signal?.addEventListener("abort", finish, { once: true });
      });
      if (signal?.aborted) {
        yield { type: "error", code: "aborted", message: "The request was cancelled." };
        return;
      }
      continue;
    }

    if (response.status === 402 && config.zeroPriceOnly) options.onModelRestricted?.("Not available at zero cost");

    // The provider says the model is gone: refresh the picker on the next render.
    if (response.status === 404 && options.onModelUnavailable) options.onModelUnavailable();

    // A 403 about *this model* (not the key) means the provider won't serve it
    // to us — e.g. "only available on approved harnesses". The same key works
    // on the provider's other models, so this is a restriction, not auth.
    if (response.status === 403 && isModelRestriction(detail)) {
      const reason = providerReason(detail);
      options.onModelRestricted?.(reason);
      yield {
        type: "error",
        code: "model_restricted",
        message: `${providerLabel} doesn't allow ${model} for this app${reason ? ` (${reason})` : ""}. It has been hidden from the picker.`,
      };
      return;
    }

    yield { type: "error", ...mapHttpError(response.status, providerLabel, model, detail) };
    return;
  }

  let usage: TokenUsage | undefined;
  let completed = false;

  try {
    for await (const data of readSse(response.body as ReadableStream<Uint8Array>)) {
      if (data === "[DONE]") { completed = true; break; }

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        yield { type: "error", code: "upstream_error", message: "The provider returned an unreadable response. Please try again." };
        return;
      }

      if (chunk.error) {
        yield {
          type: "error",
          ...mapHttpError(Number(chunk.error.code) || 500, providerLabel, model, JSON.stringify({ error: chunk.error })),
        };
        return;
      }

      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) completed = true;
      const content = choice?.delta?.content;
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter(part => part.type === "text" && typeof part.text === "string").map(part => part.text).join("") : "";
      if (text) yield { type: "text", text };
      if (choice?.finish_reason === "length") {
        yield { type: "error", code: "upstream_error", message: "The model reached its response limit. Ask for a shorter answer or continue from the last section." };
        return;
      }

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
    console.error(`[${providerLabel}] stream read failed`);
    yield { type: "error", code: "network_error", message: `The connection to ${providerLabel} was interrupted.` };
    return;
  }

  if (!completed) {
    yield { type: "error", code: "network_error", message: "The response ended early. Please retry to get the full answer." };
    return;
  }
  yield { type: "done", usage };
}

/** Assemble SSE events across arbitrary transport chunks, including CRLF and multiline data. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lines: string[] = [];
  let eventSize = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length + eventSize > 1_000_000) throw new Error("Oversized SSE event");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, boundary).replace(/\r$/, "");
        buffer = buffer.slice(boundary + 1);
        if (!line) {
          if (lines.length) yield lines.join("\n");
          lines = []; eventSize = 0;
        } else if (line.startsWith("data:")) {
          const data = line.slice(5).replace(/^ /, "");
          lines.push(data); eventSize += data.length;
        }
      }
      if (done) break;
    }
    // An event lacking its final blank line is incomplete and must not be trusted.
  } finally {
    await reader.cancel().catch(() => {});
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

/**
 * Phrases providers use when a 403 is about model access policy rather than
 * the API key. Matched against the sanitised body, never against model ids.
 */
const MODEL_RESTRICTION_PATTERN =
  /only available (on|to|through|via|for)|not available (to|for) (your|this)|requires? (approval|access|allowlist|whitelist)|not (been )?(approved|allowlisted|whitelisted)|restricted to|is restricted|access to (this|the) model|model is not (enabled|permitted)|not permitted to use/i;

function isModelRestriction(detail: string): boolean {
  return MODEL_RESTRICTION_PATTERN.test(providerReason(detail));
}

/** A 429 that is about the account's daily/monthly allowance, not a busy model. */
export function isDailyQuota(reason: string): boolean {
  return /per[- ]day|per[- ]month|daily|monthly|quota/i.test(reason);
}

/** Longest provider-quoted wait we'll absorb silently before surfacing the 429. */
const MAX_AUTO_WAIT_MS = 12_000;

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
  for (const [key, value] of Object.entries(process.env)) {
    if (/(?:_KEY|_TOKEN)$/.test(key) && value && value.length > 6) message = message.split(value).join("[redacted]");
  }
  return message
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(org|user|proj|sk|key)[_-][A-Za-z0-9_-]{6,}\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim()
    .slice(0, 240);
}

function mapHttpError(
  status: number,
  providerLabel: string,
  model: string,
  detail: string,
): { code: ChatErrorCode; message: string } {
  const reason = providerReason(detail);
  const suffix = reason ? ` (${reason})` : "";

  switch (status) {
    case 401:
    case 403:
      return { code: "upstream_error", message: `${providerLabel} rejected the server's API key${suffix}.` };
    case 402:
      return {
        code: "quota_exhausted",
        message: `${providerLabel}'s free allowance is unavailable or exhausted. Wait for it to reset or choose another connected free provider. No paid fallback will be used.`,
      };
    case 404:
      return {
        code: "upstream_error",
        message: `${providerLabel} no longer serves ${model}${suffix}. Pick another model.`,
      };
    case 400:
    case 422:
      return { code: "upstream_error", message: `${providerLabel} rejected the request for ${model}${suffix}.` };
    case 413:
      return {
        code: "upstream_error",
        message: `${providerLabel} says this request is too large for ${model}'s tier${suffix}. Pick a model with a bigger budget (Gemini or an OpenRouter free model) for this size of site.`,
      };
    case 429:
      if (isDailyQuota(reason)) {
        return {
          code: "quota_exhausted",
          message: `${providerLabel}: the daily free quota for this account is used up${suffix}. Wait for the provider to reset it, or choose another connected free provider. No paid fallback will be used.`,
        };
      }
      return {
        code: "rate_limited",
        message: `${providerLabel} is rate-limiting ${model}${suffix}. Wait a moment or pick another model.`,
      };
    case 500:
    case 502:
    case 503:
    case 504:
      return { code: "upstream_error", message: `${providerLabel} is temporarily unavailable${suffix}. Please try again.` };
    default:
      return { code: "upstream_error", message: `${providerLabel} returned an unexpected error (${status})${suffix}.` };
  }
}
