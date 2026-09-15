"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/redirect";
import { getSession } from "@/lib/auth/session";
import { upsertPreferences, upsertProfile } from "@/lib/data/account";
import { isAllowedModel } from "@/lib/gemini/models";
import { createClient } from "@/lib/supabase/server";

export interface AuthActionState {
  error?: string;
  /** Informational message (e.g. "check your inbox"). */
  message?: string;
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(formData: FormData): string | null {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function readNewPassword(formData: FormData, field = "password"): string | { error: string } {
  const password = String(formData.get(field) ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  return password;
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

// ---------------------------------------------------------------------------
// Sign in / up / out
// ---------------------------------------------------------------------------

export async function login(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  if (!email) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Deliberately generic: don't reveal whether the email exists.
    return { error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function signup(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = readEmail(formData);
  if (!email) return { error: "Enter a valid email address." };
  const password = readNewPassword(formData);
  if (typeof password !== "string") return password;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await requestOrigin()}/auth/confirm` },
  });
  if (error) return { error: error.message };

  // Email confirmation disabled in Supabase → a session exists immediately.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  // Supabase returns the same shape for already-registered emails, so this
  // message doesn't leak account existence.
  return { message: "Check your inbox — we sent you a confirmation link to finish signing up." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readEmail(formData);
  if (!email) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    // Rate limits are the only error worth surfacing; everything else stays
    // generic so the form can't be used to probe for accounts.
    if (error.status === 429) return { error: "Too many attempts. Please wait a minute and try again." };
    console.error("[auth] resetPasswordForEmail failed:", error.message);
  }

  return { message: "If an account exists for that email, a reset link is on its way." };
}

/** Sets a new password for the signed-in user (reset flow and Settings). */
export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = readNewPassword(formData);
  if (typeof password !== "string") return password;
  if (password !== String(formData.get("confirm") ?? "")) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/same password/i.test(error.message)) {
      return { error: "New password must be different from your current one." };
    }
    return { error: "Couldn't update your password. Your reset link may have expired — request a new one." };
  }

  const next = String(formData.get("next") ?? "");
  if (next) {
    revalidatePath("/", "layout");
    redirect(safeNextPath(next));
  }
  return { message: "Password updated." };
}

// ---------------------------------------------------------------------------
// Account settings
// ---------------------------------------------------------------------------

export async function updateProfile(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

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

export async function updatePreferences(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

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
