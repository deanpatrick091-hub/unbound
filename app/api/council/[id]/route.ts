import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/chat/validation";
import { deleteCouncilSession } from "@/lib/data/council";

/** DELETE /api/council/:id — removes a Council session and its opinions. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/council/[id]">,
): Promise<Response> {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(400, "invalid_request", "Invalid session id.");

  try {
    const deleted = await deleteCouncilSession(supabase, id);
    if (!deleted) return errorResponse(404, "not_found", "That session doesn't exist.");
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[council] delete failed:", error);
    return errorResponse(500, "storage_error", "Could not delete the session.");
  }
}
