import "server-only";

import type { CouncilRole, CouncilSessionStatus } from "@/lib/council/types";
import type { CouncilOpinionRow, CouncilSessionRow, MessageStatus } from "@/lib/data/types";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

export const COUNCIL_LIST_LIMIT = 100;

export type CouncilSessionSummary = Pick<CouncilSessionRow, "id" | "title" | "status" | "created_at">;

export async function listCouncilSessions(
  supabase: ServerSupabaseClient,
): Promise<CouncilSessionSummary[]> {
  const { data, error } = await supabase
    .from("council_sessions")
    .select("id, title, status, created_at")
    .order("created_at", { ascending: false })
    .limit(COUNCIL_LIST_LIMIT);
  if (error) throw new Error(`listCouncilSessions: ${error.message}`);
  return data;
}

export async function getCouncilSession(
  supabase: ServerSupabaseClient,
  id: string,
): Promise<{ session: CouncilSessionRow; opinions: CouncilOpinionRow[] } | null> {
  const { data: session, error } = await supabase
    .from("council_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCouncilSession: ${error.message}`);
  if (!session) return null;

  const { data: opinions, error: opinionsError } = await supabase
    .from("council_opinions")
    .select("*")
    .eq("session_id", id);
  if (opinionsError) throw new Error(`getCouncilSession opinions: ${opinionsError.message}`);

  return { session, opinions };
}

export async function createCouncilSession(
  supabase: ServerSupabaseClient,
  input: { userId: string; title: string; question: string; model: string },
): Promise<CouncilSessionRow> {
  const { data, error } = await supabase
    .from("council_sessions")
    .insert({
      user_id: input.userId,
      title: input.title,
      question: input.question,
      model: input.model,
      status: "running",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createCouncilSession: ${error.message}`);
  return data;
}

export async function setCouncilSessionStatus(
  supabase: ServerSupabaseClient,
  id: string,
  status: CouncilSessionStatus,
): Promise<void> {
  const { error } = await supabase
    .from("council_sessions")
    .update({
      status,
      completed_at: status === "running" ? null : new Date().toISOString(),
    })
    .eq("id", id);
  if (error) console.error("[council] status update failed:", error.message);
}

export async function upsertCouncilOpinion(
  supabase: ServerSupabaseClient,
  input: { sessionId: string; userId: string; role: CouncilRole; content: string; status: MessageStatus },
): Promise<void> {
  const { error } = await supabase.from("council_opinions").upsert(
    {
      session_id: input.sessionId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      status: input.status,
    },
    { onConflict: "session_id,role" },
  );
  if (error) console.error("[council] opinion save failed:", error.message);
}

export async function deleteCouncilSession(
  supabase: ServerSupabaseClient,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from("council_sessions").delete().eq("id", id).select("id");
  if (error) throw new Error(`deleteCouncilSession: ${error.message}`);
  return data.length > 0;
}
