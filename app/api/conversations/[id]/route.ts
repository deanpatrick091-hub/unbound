import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { isRecord, isUuid } from "@/lib/chat/validation";
import { deleteConversation, renameConversation } from "@/lib/data/conversations";

const MAX_TITLE_LENGTH = 120;

/** PATCH /api/conversations/:id — rename. Body: `{ title }`. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/conversations/[id]">,
): Promise<Response> {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(400, "invalid_request", "Invalid conversation id.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request body must be valid JSON.");
  }
  const title = isRecord(body) && typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return errorResponse(400, "invalid_request", `Title must be 1–${MAX_TITLE_LENGTH} characters.`);
  }

  try {
    const updated = await renameConversation(supabase, id, title);
    if (!updated) return errorResponse(404, "not_found", "That conversation doesn't exist.");
    return Response.json({ conversation: { id: updated.id, title: updated.title } });
  } catch (error) {
    console.error("[conversations] rename failed:", error);
    return errorResponse(500, "storage_error", "Could not rename the conversation.");
  }
}

/** DELETE /api/conversations/:id — removes the conversation and its messages. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/conversations/[id]">,
): Promise<Response> {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(400, "invalid_request", "Invalid conversation id.");

  try {
    const deleted = await deleteConversation(supabase, id);
    if (!deleted) return errorResponse(404, "not_found", "That conversation doesn't exist.");
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[conversations] delete failed:", error);
    return errorResponse(500, "storage_error", "Could not delete the conversation.");
  }
}
