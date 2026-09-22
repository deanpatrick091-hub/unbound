import type { NextRequest } from "next/server";

import { errorResponse, limitResponse, NDJSON_HEADERS } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import type { TokenUsage } from "@/lib/chat/types";
import { isRecord, parseContent, titleFromContent } from "@/lib/chat/validation";
import { buildJudgeInput, instructionFor } from "@/lib/council/prompts";
import {
  COUNCIL_LIMITS,
  PERSPECTIVE_ROLES,
  type CouncilRole,
  type CouncilSessionStatus,
  type CouncilStreamEvent,
  type PerspectiveRole,
} from "@/lib/council/types";
import { getDefaultModelFor } from "@/lib/data/account";
import { insertUsage } from "@/lib/data/conversations";
import {
  createCouncilSession,
  listCouncilSessions,
  setCouncilSessionStatus,
  upsertCouncilOpinion,
} from "@/lib/data/council";
import type { MessageStatus } from "@/lib/data/types";
import { streamWithFallback as streamGeneration } from "@/lib/ai/generate";
import { parseModelId, resolveModel } from "@/lib/ai/models";
import { isProviderEnabled, providerNotConfiguredMessage } from "@/lib/ai/providers";
import { consumeRequest } from "@/lib/limits/consume";

// Five sequential-ish model calls; allow more headroom than a single chat turn.
export const maxDuration = 120;

/** GET /api/council — the caller's Council sessions, newest first. */
export async function GET(): Promise<Response> {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");
  try {
    const sessions = await listCouncilSessions(supabase);
    return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[council] list failed:", error);
    return errorResponse(500, "storage_error", "Could not load your Council history.");
  }
}

interface MemberResult {
  role: CouncilRole;
  text: string;
  status: MessageStatus;
}

/**
 * POST /api/council — orchestrates one Council run.
 *
 * Four perspectives run concurrently with independent system instructions;
 * their deltas are multiplexed onto one NDJSON stream. The Judge then
 * receives all four analyses and streams the synthesis. Every stage is
 * persisted (including partial output on cancel), and the whole run costs
 * FEATURE_COST.council units against the caller's budget.
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
  if (!isRecord(body)) return errorResponse(400, "invalid_request", "Request body must be a JSON object.");
  const question = parseContent(body.question, COUNCIL_LIMITS.maxQuestionLength);
  if (!question.ok) return errorResponse(400, "invalid_request", question.message.replace("content", "question"));

  const model = resolveModel(body.model, await getDefaultModelFor(supabase, user.id));
  const { provider } = parseModelId(model);
  if (!isProviderEnabled(provider)) {
    return errorResponse(400, "not_configured", providerNotConfiguredMessage(provider));
  }

  const limit = await consumeRequest(supabase, "council");
  if (!limit.allowed) return limitResponse(limit);

  // Persistence is best-effort: without storage the run still happens, it just
  // won't appear in Council history.
  const title = titleFromContent(question.data);
  let sessionId: string;
  let persisted = true;
  try {
    const session = await createCouncilSession(supabase, {
      userId: user.id,
      title,
      question: question.data,
      model,
    });
    sessionId = session.id;
  } catch (error) {
    console.warn("[council] storage unavailable — running without persistence:", error);
    sessionId = crypto.randomUUID();
    persisted = false;
  }

  const abort = new AbortController();
  const encoder = new TextEncoder();
  const userId = user.id;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: CouncilStreamEvent) => {
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
          // already closed
        }
      };

      const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      const runMember = async (role: CouncilRole, input: string): Promise<MemberResult> => {
        let text = "";
        let status: MessageStatus = "complete";
        let message: string | undefined;

        for await (const event of streamGeneration({
          model,
          systemInstruction: instructionFor(role),
          turns: [{ role: "user", content: input }],
          signal: abort.signal,
          temperature: role === "judge" ? 0.4 : 0.8,
        })) {
          if (event.type === "text") {
            text += event.text;
            send({ type: "delta", role, text: event.text });
          } else if (event.type === "error") {
            status = event.code === "aborted" ? "cancelled" : "error";
            message = event.message;
          } else if (event.type === "fallback") {
            // Another free model is answering for this seat; nothing to show.
          } else if (event.usage) {
            totalUsage.promptTokens += event.usage.promptTokens;
            totalUsage.completionTokens += event.usage.completionTokens;
            totalUsage.totalTokens += event.usage.totalTokens;
            if (persisted) await insertUsage(supabase, {
              userId,
              feature: "council",
              councilSessionId: sessionId,
              model,
              ...event.usage,
            });
          }
        }
        if (abort.signal.aborted) status = "cancelled";
        if (status === "complete" && text.length === 0) {
          status = "error";
          message = "No response was produced.";
        }

        if (persisted) await upsertCouncilOpinion(supabase, { sessionId, userId, role, content: text, status });
        send({ type: "member_done", role, status, message });
        return { role, text, status };
      };

      const run = async () => {
        send({ type: "session", sessionId, title, model, persisted });
        send({ type: "phase", phase: "perspectives" });

        const perspectives = await Promise.all(
          PERSPECTIVE_ROLES.map((role) => runMember(role, question.data)),
        );

        let finalStatus: CouncilSessionStatus;

        if (abort.signal.aborted) {
          finalStatus = "cancelled";
        } else {
          const usable = perspectives.filter((p) => p.status === "complete");
          if (usable.length < 2) {
            finalStatus = "error";
            send({
              type: "error",
              code: "upstream_error",
              message: "Too few council members could respond. Please try again.",
            });
          } else {
            send({ type: "phase", phase: "judge" });
            const judgeInput = buildJudgeInput(
              question.data,
              perspectives.map((p) => ({
                role: p.role as PerspectiveRole,
                content: p.status === "complete" ? p.text : null,
              })),
            );
            const judge = await runMember("judge", judgeInput);
            finalStatus = judge.status === "complete" ? "complete" : judge.status === "cancelled" ? "cancelled" : "error";
          }
        }

        if (persisted) await setCouncilSessionStatus(supabase, sessionId, finalStatus);
        if (finalStatus !== "cancelled") send({ type: "done", status: finalStatus, usage: totalUsage });
        close();
      };

      run().catch(async (error) => {
        console.error("[council] runner crashed:", error);
        if (persisted) await setCouncilSessionStatus(supabase, sessionId, "error");
        send({ type: "error", code: "upstream_error", message: "The Council run failed. Please try again." });
        close();
      });
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
