import type { NextRequest } from "next/server";

import { errorResponse, limitResponse, NDJSON_HEADERS } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { CHAT_SYSTEM_INSTRUCTION } from "@/lib/chat/prompt";
import type { ChatStreamEvent, TokenUsage } from "@/lib/chat/types";
import { isRecord, parseChatRequest, titleFromContent } from "@/lib/chat/validation";
import { getDefaultModelFor } from "@/lib/data/account";
import {
  createConversation,
  getConversation,
  insertMessage,
  insertUsage,
  listRecentMessages,
  updateConversationModel,
} from "@/lib/data/conversations";
import type { ConversationRow, MessageStatus } from "@/lib/data/types";
import { streamWithFallback, type GenerationTurn } from "@/lib/ai/generate";
import { parseModelId, resolveModel } from "@/lib/ai/models";
import { isProviderEnabled, providerNotConfiguredMessage } from "@/lib/ai/providers";
import { consumeRequest } from "@/lib/limits/consume";

// Gemini responses can run longer than the default serverless timeout.
export const maxDuration = 60;

/**
 * POST /api/chat
 *
 * Body: `{ conversationId?, content, model? }`. Creates the conversation when
 * needed, stores the user turn, streams the reply as NDJSON `ChatStreamEvent`s
 * and stores the assistant turn (including partial output on cancel/error).
 * Every database call runs under the caller's RLS session.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request body must be valid JSON.");
  }
  const parsed = parseChatRequest(body);
  if (!parsed.ok) return errorResponse(400, "invalid_request", parsed.message);
  // Only a boolean switch is read from the browser here; it can't widen anything.
  const allowFallback = !(isRecord(body) && body.autoFallback === false);
  const { conversationId: requestedId, model: requestedModel } = parsed.data;
  const content = parsed.data.retry === true ? null : parsed.data.content;

  // Resolve the conversation (RLS makes another user's id look like "not found").
  // A storage outage here is treated as "no stored conversation", not a hard error.
  let conversation: ConversationRow | null = null;
  let storageAvailable = true;
  if (requestedId) {
    try {
      conversation = await getConversation(supabase, requestedId);
      if (!conversation) return errorResponse(404, "not_found", "That conversation doesn't exist.");
    } catch (error) {
      console.warn("[chat] storage unavailable while loading conversation:", error);
      storageAvailable = false;
    }
  }

  const model = resolveModel(
    requestedModel,
    conversation?.model ?? (await getDefaultModelFor(supabase, user.id)),
  );
  const { provider } = parseModelId(model);
  if (!isProviderEnabled(provider)) {
    return errorResponse(400, "not_configured", providerNotConfiguredMessage(provider));
  }

  // Usage protection — server-side and atomic when available. An unreachable
  // limiter lets the request through (logged); an over-budget verdict does not.
  const limit = await consumeRequest(supabase, "chat");
  if (!limit.allowed) return limitResponse(limit);

  // Persistence is best-effort: if the database can't store this turn, the
  // reply is still generated and streamed, just not saved.
  let createdTitle: string | undefined;
  if (storageAvailable) {
    try {
      if (!conversation) {
        createdTitle = titleFromContent(content ?? "");
        conversation = await createConversation(supabase, { userId: user.id, title: createdTitle, model });
      } else if (conversation.model !== model) {
        await updateConversationModel(supabase, conversation.id, model);
      }
    } catch (error) {
      console.warn("[chat] storage unavailable — continuing without persistence:", error);
      storageAvailable = false;
      conversation = null;
      createdTitle = undefined;
    }
  }

  let userMessageId: string | undefined;
  let turns: GenerationTurn[] = [];
  if (storageAvailable && conversation) {
    try {
      if (content !== null) {
        const saved = await insertMessage(supabase, {
          conversationId: conversation.id,
          userId: user.id,
          role: "user",
          content,
        });
        userMessageId = saved.id;
      }
      const history = await listRecentMessages(supabase, conversation.id);
      turns = history
        // Failed/empty assistant turns add nothing useful to the context.
        .filter((m) => m.role === "user" || (m.status !== "error" && m.content.length > 0))
        .map((m) => ({ role: m.role, content: m.content }));
    } catch (error) {
      console.warn("[chat] storage unavailable — continuing without persistence:", error);
      storageAvailable = false;
      conversation = null;
      userMessageId = undefined;
      turns = [];
    }
  }

  if (!storageAvailable) {
    // Ephemeral mode: context comes from the client's own copy of the thread.
    const fallback = parsed.data.retry === true ? [] : (parsed.data.history ?? []);
    turns = fallback.filter((t) => t.content.length > 0).map((t) => ({ role: t.role, content: t.content }));
    if (content !== null) turns.push({ role: "user", content });
  }

  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") {
    return errorResponse(400, "invalid_request", "There is no pending user message to reply to.");
  }

  const abort = new AbortController();
  const encoder = new TextEncoder();
  const conversationId = conversation?.id;
  const persisted = storageAvailable && conversationId !== undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by cancel.
        }
      };

      const run = async () => {
        send({ type: "meta", conversationId, title: createdTitle, userMessageId, model, persisted });

        let text = "";
        let status: MessageStatus = "complete";
        let usage: TokenUsage | undefined;
        let failure: Extract<ChatStreamEvent, { type: "error" }> | undefined;
        // The model that actually answered (may differ after a rate-limit fallback).
        let usedModel = model;

        for await (const event of streamWithFallback({
          model,
          systemInstruction: CHAT_SYSTEM_INSTRUCTION,
          turns,
          signal: abort.signal,
          allowFallback,
        })) {
          if (event.type === "text") {
            text += event.text;
            send(event);
          } else if (event.type === "fallback") {
            usedModel = event.to;
            send({ type: "model_switched", from: event.from, to: event.to, reason: event.reason });
          } else if (event.type === "error") {
            status = event.code === "aborted" ? "cancelled" : "error";
            failure = event;
          } else {
            usage = event.usage;
          }
        }
        if (abort.signal.aborted) status = "cancelled";

        if (status === "complete" && text.length === 0) {
          status = "error";
          failure = {
            type: "error",
            code: "upstream_error",
            message: "The model returned an empty response. Please try again.",
          };
        }

        // Persist whatever we have (partial output on cancel/error is kept so
        // the user can see it in history). A save failure never turns a good
        // reply into an error — the client already announced persisted=false
        // or will see the reply either way.
        let assistantMessageId: string | undefined;
        if (persisted && conversationId && text.length > 0) {
          try {
            const saved = await insertMessage(supabase, {
              conversationId,
              userId: user.id,
              role: "assistant",
              content: text,
              model: usedModel,
              status,
            });
            assistantMessageId = saved.id;
          } catch (error) {
            console.warn("[chat] assistant persistence failed:", error);
          }
        }

        if (usage && persisted) {
          await insertUsage(supabase, {
            userId: user.id,
            feature: "chat",
            conversationId,
            model: usedModel,
            ...usage,
          });
        }

        if (status === "complete") send({ type: "done", assistantMessageId, usage, model: usedModel });
        else if (failure && status !== "cancelled") send(failure);
        close();
      };

      run().catch((error) => {
        console.error("[chat] stream runner crashed:", error);
        send({ type: "error", code: "upstream_error", message: "Something went wrong. Please try again." });
        close();
      });
    },
    cancel() {
      // Client went away: stop Gemini; `run` persists the partial reply.
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
