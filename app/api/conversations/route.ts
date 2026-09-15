import { errorResponse } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { listConversations } from "@/lib/data/conversations";

/** GET /api/conversations — the caller's conversations, most recent first. */
export async function GET(): Promise<Response> {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");

  try {
    const conversations = await listConversations(supabase);
    return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[conversations] list failed:", error);
    return errorResponse(500, "storage_error", "Could not load your conversations.");
  }
}
