import "server-only";

import { CHAT_LIMITS } from "@/lib/chat/types";
import type {
  ConversationRow,
  MessageRow,
  MessageStatus,
  TokenUsageInsert,
} from "@/lib/data/types";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

/*
 * All queries run through the caller's session client, so RLS decides what is
 * visible. `user_id` is still set explicitly on inserts because the policies
 * require it to equal auth.uid().
 */

export const CONVERSATION_LIST_LIMIT = 100;

export async function listConversations(
  supabase: ServerSupabaseClient,
): Promise<Pick<ConversationRow, "id" | "title" | "model" | "updated_at">[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, model, updated_at")
    .order("updated_at", { ascending: false })
    .limit(CONVERSATION_LIST_LIMIT);
  if (error) throw new Error(`listConversations: ${error.message}`);
  return data;
}

export async function getConversation(
  supabase: ServerSupabaseClient,
  id: string,
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getConversation: ${error.message}`);
  return data;
}

export async function listMessages(
  supabase: ServerSupabaseClient,
  conversationId: string,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMessages: ${error.message}`);
  return data;
}

/** The most recent turns, oldest first, for use as model context. */
export async function listRecentMessages(
  supabase: ServerSupabaseClient,
  conversationId: string,
  limit = CHAT_LIMITS.contextMessages,
): Promise<Pick<MessageRow, "role" | "content" | "status">[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentMessages: ${error.message}`);
  return data.reverse();
}

export async function createConversation(
  supabase: ServerSupabaseClient,
  input: { userId: string; title: string; model: string },
): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: input.userId, title: input.title, model: input.model })
    .select("*")
    .single();
  if (error) throw new Error(`createConversation: ${error.message}`);
  return data;
}

export async function renameConversation(
  supabase: ServerSupabaseClient,
  id: string,
  title: string,
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`renameConversation: ${error.message}`);
  return data;
}

export async function updateConversationModel(
  supabase: ServerSupabaseClient,
  id: string,
  model: string,
): Promise<void> {
  const { error } = await supabase.from("conversations").update({ model }).eq("id", id);
  if (error) throw new Error(`updateConversationModel: ${error.message}`);
}

/** Returns true if a row was deleted (i.e. it existed and was ours). */
export async function deleteConversation(
  supabase: ServerSupabaseClient,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteConversation: ${error.message}`);
  return data.length > 0;
}

export async function insertMessage(
  supabase: ServerSupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    role: MessageRow["role"];
    content: string;
    model?: string;
    status?: MessageStatus;
  },
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      status: input.status ?? "complete",
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertMessage: ${error.message}`);
  return data;
}

export async function insertUsage(
  supabase: ServerSupabaseClient,
  input: TokenUsageInsert,
): Promise<void> {
  const { error } = await supabase.from("usage").insert({
    user_id: input.userId,
    feature: input.feature,
    conversation_id: input.conversationId ?? null,
    council_session_id: input.councilSessionId ?? null,
    model: input.model,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    total_tokens: input.totalTokens,
  });
  // Usage accounting must never break a user-facing response.
  if (error) console.error("[usage] insert failed:", error.message);
}
