/**
 * Shared chat types. Safe to import from both server and client code —
 * this module must never import anything server-only.
 */

export type ChatRole = "user" | "assistant";

/** A message as it exists in the client UI. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Non-complete assistant turns are shown with a subtle marker. */
  status?: "complete" | "error" | "cancelled";
  /** Small footnote under an assistant turn (e.g. which model answered after a fallback). */
  note?: string;
}

/**
 * POST /api/chat request. History is loaded server-side from the database —
 * the browser never supplies prior turns.
 */
/** A prior turn supplied by the client. Only used when the server cannot load history itself. */
export interface ChatHistoryTurn {
  role: ChatRole;
  content: string;
}

export type ChatRequestBody =
  | {
      /** Omit to start a new conversation. */
      conversationId?: string;
      content: string;
      /** Validated against the server allowlist; falls back to the user's default. */
      model?: string;
      /**
       * Fallback context for when persistence is unavailable. Ignored whenever
       * the conversation exists in the database (that history is authoritative).
       */
      history?: ChatHistoryTurn[];
      retry?: false;
    }
  | {
      /** Re-generate a reply for the stored history (last turn must be the user's). */
      conversationId: string;
      model?: string;
      retry: true;
    };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Newline-delimited JSON events streamed from POST /api/chat.
 *
 * `meta` is always first. Errors can occur after the 200 header has been sent
 * (rate limits, safety blocks mid-generation), so they are delivered in-band.
 * `done` is always the final event of a successful stream.
 */
export type ChatStreamEvent =
  | {
      type: "meta";
      /** Absent when the turn could not be persisted (ephemeral reply). */
      conversationId?: string;
      /** Present when this request created the conversation. */
      title?: string;
      /** Absent on retry (no new user turn was stored). */
      userMessageId?: string;
      model: string;
      /** False when the database was unavailable and nothing was saved. */
      persisted: boolean;
    }
  | { type: "text"; text: string }
  /** The chosen model was rate-limited before replying; another model is answering instead. */
  | { type: "model_switched"; from: string; to: string; reason: string }
  | { type: "error"; code: ChatErrorCode; message: string }
  | { type: "done"; assistantMessageId?: string; usage?: TokenUsage; model?: string };

export type ChatErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "limit_reached"
  | "not_configured"
  | "rate_limited"
  | "content_blocked"
  | "upstream_error"
  | "network_error"
  | "storage_error"
  | "aborted";

/** JSON error body for non-streaming failures (4xx/5xx before streaming). */
export interface ChatErrorResponse {
  error: { code: ChatErrorCode; message: string };
}

export const CHAT_LIMITS = {
  /** Max characters in a single message. */
  maxMessageLength: 8_000,
  /** How many prior turns are sent to the model as context. */
  contextMessages: 40,
  /** Max characters of a generated conversation title. */
  maxTitleLength: 60,
} as const;
