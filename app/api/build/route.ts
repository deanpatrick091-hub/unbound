import {getProject,isUuid} from "@/lib/projects/server";
import type {Json} from "@/lib/supabase/database.types";
import type { NextRequest } from "next/server";

import { streamWithFallback, type GenerationTurn } from "@/lib/ai/generate";
import { resolveModel } from "@/lib/ai/models";
import { errorResponse, limitResponse, NDJSON_HEADERS } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { siteByteSize } from "@/lib/build/assemble";
import { BuildOutputParser } from "@/lib/build/parser";
import { BUILD_SYSTEM_INSTRUCTION, formatCurrentFiles } from "@/lib/build/prompt";
import {
  BUILD_LIMITS,
  isSiteFileName,
  type BuildHistoryTurn,
  type BuildRequestBody,
  type BuildStreamEvent,
  type SiteFiles,
} from "@/lib/build/types";
import type { TokenUsage } from "@/lib/chat/types";
import { isRecord, parseContent } from "@/lib/chat/validation";
import { getDefaultModelFor } from "@/lib/data/account";
import { insertUsage } from "@/lib/data/conversations";
import { consumeRequest } from "@/lib/limits/consume";

// Whole sites take longer than a chat turn.
export const maxDuration = 300;

type Parsed = { ok: true; data: BuildRequestBody } | { ok: false; message: string };

function parseBuildRequest(body: unknown): Parsed {
  if (!isRecord(body)) return { ok: false, message: "Request body must be a JSON object." };

  const instruction = parseContent(body.instruction, BUILD_LIMITS.maxInstructionLength);
  if (!instruction.ok) return { ok: false, message: instruction.message.replace("content", "instruction") };

  const files: SiteFiles = {};
  if (body.files !== undefined) {
    if (!isRecord(body.files)) return { ok: false, message: "files must be an object." };
    for (const [name, content] of Object.entries(body.files)) {
      if (!isSiteFileName(name)) return { ok: false, message: `Unsupported file: ${name}` };
      if (typeof content !== "string") return { ok: false, message: `${name} must be a string.` };
      files[name] = content;
    }
    if (siteByteSize(files) > BUILD_LIMITS.maxSiteBytes) {
      return { ok: false, message: "The current site is too large to edit." };
    }
  }

  const history: BuildHistoryTurn[] = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) return { ok: false, message: "history must be an array." };
    for (const item of body.history.slice(-BUILD_LIMITS.contextTurns)) {
      if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") {
        return { ok: false, message: "history items are malformed." };
      }
      const content = item.content.trim();
      if (content) history.push({ role: item.role, content });
    }
  }

  const model = typeof body.model === "string" ? body.model : undefined;
  return { ok: true, data: { instruction: instruction.data, files, model, history } };
}

/**
 * POST /api/build — one builder turn.
 *
 * The client sends the instruction plus the site as it currently exists;
 * the model returns a short message and every file in full. Files are parsed
 * incrementally and streamed back as they complete. Nothing generated is
 * executed here — the server only forwards text.
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
  const parsed = parseBuildRequest(body);
  if (!parsed.ok) return errorResponse(400, "invalid_request", parsed.message);
  const { instruction } = parsed.data;
  if(!isRecord(body)||!isUuid(body.projectId)||!Number.isInteger(body.revision))return errorResponse(400,'invalid_request','Open a saved Build project before generating.');
  const project=await getProject(body.projectId);
  if(!project)return errorResponse(404,'invalid_request','Project unavailable.');
  if(project.role==='viewer')return errorResponse(403,'invalid_request','This project is read-only.');
  if(project.revision!==body.revision)return errorResponse(409,'invalid_request','This project changed elsewhere. Reopen it before building.');
  const files=project.files;
  const history=project.conversation.slice(-BUILD_LIMITS.contextTurns).map(m=>({role:m.role,content:m.content}));

  const model = resolveModel(parsed.data.model, await getDefaultModelFor(supabase, user.id));
  const limit = await consumeRequest(supabase, "build");
  if (!limit.allowed) return limitResponse(limit);

  // Conversation context: prior instructions and the model's summaries, then
  // the current files and the new instruction as the final user turn.
  const current = formatCurrentFiles(files);
  const turns: GenerationTurn[] = [
    ...(history ?? []).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: current ? `${current}\n\nRequest: ${instruction}` : instruction },
  ];

  const abort = new AbortController();
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: BuildStreamEvent) => {
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

      const run = async () => {
        send({ type: "meta", model });

        const parser = new BuildOutputParser();
        let usedModel = model;
        let usage: TokenUsage | undefined;
        let failure: Extract<BuildStreamEvent, { type: "error" }> | undefined;
        let produced = 0;
        let summary="";
        const outputFiles:SiteFiles={...files};

        const emit = (pieces: ReturnType<BuildOutputParser["push"]>) => {
          for (const piece of pieces) {
            if (piece.kind === "text") {summary+=piece.text;send({ type: "text", text: piece.text });}
            else if (piece.kind === "file_start") send({ type: "file_start", name: piece.name });
            else {outputFiles[piece.name]=piece.content;send({ type: "file", name: piece.name, content: piece.content });}
          }
        };

        for await (const event of streamWithFallback({
          model,
          systemInstruction: BUILD_SYSTEM_INSTRUCTION,
          turns,
          signal: AbortSignal.any([abort.signal, request.signal]),
          temperature: 0.5,
          maxTokens: 16_000,
          longRunning: true,
        })) {
          if (event.type === "text") {
            produced += event.text.length;
            if (produced > BUILD_LIMITS.maxSiteBytes) {
              failure = { type: "error", code: "upstream_error", message: "The generated site exceeded the size limit." };
              abort.abort();
              break;
            }
            emit(parser.push(event.text));
          } else if (event.type === "fallback") {
            usedModel = event.to;
            send({ type: "model_switched", from: event.from, to: event.to, reason: event.reason });
          } else if (event.type === "error") {
            if (event.code !== "aborted") failure = event;
          } else {
            usage = event.usage;
          }
        }

        emit(parser.finish());

        if (usage) {
          await insertUsage(supabase, { userId: user.id, feature: "build", model: usedModel, ...usage });
        }

        if (failure) send(failure);
        else if (!abort.signal.aborted) {
          if(!outputFiles['index.html']?.trim()){send({type:'error',code:'upstream_error',message:'The model did not produce a complete webpage. Your previous version is safe.'});close();return;}
          const now=Date.now();
          const conversation=[...project.conversation,{id:crypto.randomUUID(),role:'user',content:instruction,createdAt:now},{id:crypto.randomUUID(),role:'assistant',content:summary.trim()||'Done — the preview is updated.',createdAt:now,status:'complete'}];
          const saved=await supabase.rpc('save_project',{p_id:project.id,p_revision:project.revision,p_files:outputFiles as Json,p_conversation:conversation as Json,p_model:usedModel,p_settings:project.settings,p_preview:project.preview_state});
          if(saved.error)send({type:'error',code:'upstream_error',message:saved.error.code==='40001'?'Another editor saved a newer version. Reopen this project.':'The generated site could not be saved. Your previous version is safe; please retry.'});
          else send({type:'done',usage,model:usedModel,revision:saved.data});
        }
        close();
      };

      run().catch((error) => {
        console.error("[build] stream runner crashed:", error);
        send({ type: "error", code: "upstream_error", message: "Something went wrong while building. Please try again." });
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
