import "server-only";

import type { ProfileRow, UserPreferencesRow } from "@/lib/data/types";
import { DEFAULT_MODEL_ID, resolveModel } from "@/lib/gemini/models";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

export async function getProfile(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  return data;
}

export async function upsertProfile(
  supabase: ServerSupabaseClient,
  input: { userId: string; email: string | null; displayName: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: input.userId, email: input.email, display_name: input.displayName }, { onConflict: "id" });
  if (error) throw new Error(`upsertProfile: ${error.message}`);
}

export async function getPreferences(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<UserPreferencesRow | null> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getPreferences: ${error.message}`);
  return data;
}

/** The user's default model, guaranteed to be on the allowlist. */
export async function getDefaultModelFor(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string> {
  try {
    const prefs = await getPreferences(supabase, userId);
    return resolveModel(prefs?.default_model, DEFAULT_MODEL_ID);
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

export async function upsertPreferences(
  supabase: ServerSupabaseClient,
  input: { userId: string; defaultModel: string },
): Promise<void> {
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: input.userId, default_model: input.defaultModel }, { onConflict: "user_id" });
  if (error) throw new Error(`upsertPreferences: ${error.message}`);
}

export interface UsageSummary {
  dayUnits: number;
  monthUnits: number;
  dayTokens: number;
  monthTokens: number;
}

export async function getUsageSummary(supabase: ServerSupabaseClient): Promise<UsageSummary> {
  const { data, error } = await supabase.rpc("usage_summary");
  if (error) throw new Error(`usage_summary: ${error.message}`);
  const row = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
  return {
    dayUnits: num(row.day_units),
    monthUnits: num(row.month_units),
    dayTokens: num(row.day_tokens),
    monthTokens: num(row.month_tokens),
  };
}
