import type { NextRequest } from "next/server";

import { errorResponse, limitResponse, NDJSON_HEADERS } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { CHAT_SYSTEM_INSTRUCTION } from "@/lib/chat/prompt";
import type { ChatStreamEvent, TokenUsage } from "@/lib/chat/types";
import { parseChatRequest, titleFromContent } from "@/lib/chat/validation";
import { getDefaultModelFor } from "@/lib/data/account";
import {
  createConversation,
  getConversation,
  insertMessage,
  insertUsage,
  listRecentMessages,
  updateConversationModel,
} from "@/lib/data/conversations";
import type { MessageStatus } from "@/lib/data/types";
import { streamGeneration, type GenerationTurn } from "@/lib/ai/generate";
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
  const { conversationId: requestedId, model: requestedModel } = parsed.data;
  const content = parsed.data.retry === true ? null : parsed.data.content;

  // Resolve the conversation (RLS makes another user's id look like "not found").
  let conversation = requestedId ? await getConversation(supabase, requestedId) : null;
  if (requestedId && !conversation) {
    return errorResponse(404, "not_found", "That conversation doesn't exist.");
  }

  const model = resolveModel(
    requestedModel,
    conversation?.model ?? (await getDefaultModelFor(supabase, user.id)),
  );
  const { provider } = parseModelId(model);
  if (!isProviderEnabled(provider)) {
    return errorResponse(400, "not_configured", providerNotConfiguredMessage(provider));
  }

  // Usage protection — server-side, atomic, fails closed.
  const limit = await consumeRequest(supabase, "chat");
  if (!limit.allowed) return limitResponse(limit);

  let createdTitle: string | undefined;
  try {
    if (!conversation) {
      createdTitle = titleFromContent(content ?? "");
      conversation = await createConversation(supabase, { userId: user.id, title: createdTitle, model });
    } else if (conversation.model !== model) {
      await updateConversationModel(supabase, conversation.id, model);
    }
  } catch (error) {
    console.error("[chat] conversation setup failed:", error);
    return errorResponse(500, "storage_error", "Could not start the conversation. Please try again.");
  }

  let userMessageId: string | undefined;
  let turns: GenerationTurn[];
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

    const last = turns[turns.length - 1];
    if (!last || last.role !== "user") {
      return errorResponse(400, "invalid_request", "There is no pending user message to reply to.");
    }
  } catch (error) {
    console.error("[chat] message persistence failed:", error);
    return errorResponse(500, "storage_error", "Could not save your message. Please try again.");
  }

  const abort = new AbortController();
  const encoder = new TextEncoder();
  const { id: conversationId } = conversation;
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
        send({ type: "meta", conversationId, title: createdTitle, userMessageId, model });

        let text = "";
        let status: MessageStatus = "complete";
        let usage: TokenUsage | undefined;
        let failure: Extract<ChatStreamEvent, { type: "error" }> | undefined;

        for await (const event of streamGeneration({
          model,
          systemInstruction: CHAT_SYSTEM_INSTRUCTION,
          turns,
          signal: abort.signal,
        })) {
          if (event.type === "text") {
            text += event.text;
            send(event);
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
        // the user can see it in history).
        let assistantMessageId: string | undefined;
        if (text.length > 0) {
          try {
            const saved = await insertMessage(supabase, {
              conversationId,
              userId: user.id,
              role: "assistant",
              content: text,
              model,
              status,
            });
            assistantMessageId = saved.id;
          } catch (error) {
            console.error("[chat] assistant persistence failed:", error);
            if (status === "complete") {
              failure = {
                type: "error",
                code: "storage_error",
                message: "The reply was generated but could not be saved to your history.",
              };
              status = "error";
            }
          }
        }

        if (usage) {
          await insertUsage(supabase, {
            userId: user.id,
            feature: "chat",
            conversationId,
            model,
            ...usage,
          });
        }

        if (status === "complete") send({ type: "done", assistantMessageId, usage });
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
