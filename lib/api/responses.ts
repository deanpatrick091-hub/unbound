import type { ChatErrorCode, ChatErrorResponse } from "@/lib/chat/types";
import type { ConsumeResult } from "@/lib/limits/consume";

export function errorResponse(
  status: number,
  code: ChatErrorCode,
  message: string,
  headers?: HeadersInit,
): Response {
  const body: ChatErrorResponse = { error: { code, message } };
  return Response.json(body, { status, headers });
}

/** 429 with Retry-After for a denied usage check. */
export function limitResponse(result: Extract<ConsumeResult, { allowed: false }>): Response {
  const headers: Record<string, string> = {};
  if (result.retryAfterSeconds) headers["Retry-After"] = String(result.retryAfterSeconds);
  return errorResponse(429, "limit_reached", result.message, headers);
}

/** Streaming NDJSON response headers. */
export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
} as const;
