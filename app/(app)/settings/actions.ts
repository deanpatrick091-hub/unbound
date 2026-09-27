"use server";

import { revalidatePath } from "next/cache";

import { isAllowedModel } from "@/lib/gemini/models";
import { getSession } from "@/lib/auth/session";
import { upsertPreferences, upsertProfile } from "@/lib/data/account";

/** Result of a settings form submission. */
export interface ActionState {
  error?: string;
  /** Informational message shown on success. */
  message?: string;
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Your session expired. Reload the page and try again." };

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length > 80) return { error: "Display name must be at most 80 characters." };

  try {
    await upsertProfile(supabase, {
      userId: user.id,
      email: user.email,
      displayName: displayName || null,
    });
  } catch (error) {
    console.error("[settings] profile update failed:", error);
    return { error: "Couldn't save your profile. Please try again." };
  }

  revalidatePath("/settings");
  return { message: "Profile saved." };
}

export async function updatePreferences(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Your session expired. Reload the page and try again." };

  const model = String(formData.get("default_model") ?? "");
  if (!isAllowedModel(model)) return { error: "That model isn't available." };

  try {
    await upsertPreferences(supabase, { userId: user.id, defaultModel: model });
  } catch (error) {
    console.error("[settings] preferences update failed:", error);
    return { error: "Couldn't save your preferences. Please try again." };
  }

  revalidatePath("/", "layout");
  return { message: "Preferences saved." };
}
