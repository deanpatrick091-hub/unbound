import { CHAT_LIMITS, type ChatHistoryTurn, type ChatRequestBody } from "@/lib/chat/types";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Validates a single user turn. Returns trimmed content within limits. */
export function parseContent(
  value: unknown,
  maxLength: number = CHAT_LIMITS.maxMessageLength,
): ParseResult<string> {
  if (typeof value !== "string") return { ok: false, message: "content must be a string." };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, message: "content must not be empty." };
  if (trimmed.length > maxLength) {
    return { ok: false, message: `content exceeds ${maxLength} characters.` };
  }
  return { ok: true, data: trimmed };
}

/** Validates an untrusted POST /api/chat body. */
export function parseChatRequest(body: unknown): ParseResult<ChatRequestBody> {
  if (!isRecord(body)) return { ok: false, message: "Request body must be a JSON object." };

  const { conversationId, model, retry } = body;
  if (conversationId !== undefined && !isUuid(conversationId)) {
    return { ok: false, message: "conversationId must be a UUID." };
  }
  if (model !== undefined && typeof model !== "string") {
    return { ok: false, message: "model must be a string." };
  }

  if (retry === true) {
    if (!conversationId) return { ok: false, message: "retry requires a conversationId." };
    return { ok: true, data: { conversationId, model, retry: true } };
  }

  const content = parseContent(body.content);
  if (!content.ok) return content;

  const history = parseHistory(body.history);
  if (!history.ok) return history;

  return { ok: true, data: { content: content.data, conversationId, model, history: history.data } };
}

/**
 * Validates optional client-supplied history: well-formed turns only, each
 * within the message limit, and capped to the context window. Undefined when
 * absent. Never trusted over database history.
 */
function parseHistory(value: unknown): ParseResult<ChatHistoryTurn[] | undefined> {
  if (value === undefined) return { ok: true, data: undefined };
  if (!Array.isArray(value)) return { ok: false, message: "history must be an array." };

  const turns: ChatHistoryTurn[] = [];
  for (const item of value.slice(-CHAT_LIMITS.contextMessages)) {
    if (!isRecord(item)) return { ok: false, message: "history items must be objects." };
    if (item.role !== "user" && item.role !== "assistant") {
      return { ok: false, message: 'history roles must be "user" or "assistant".' };
    }
    const content = parseContent(item.content);
    if (!content.ok) return { ok: false, message: `history: ${content.message}` };
    turns.push({ role: item.role, content: content.data });
  }
  return { ok: true, data: turns };
}

/** Derives a short, readable title from the first user message. */
export function titleFromContent(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= CHAT_LIMITS.maxTitleLength) return oneLine;
  const cut = oneLine.slice(0, CHAT_LIMITS.maxTitleLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 24 ? cut.slice(0, lastSpace) : cut}…`;
}
