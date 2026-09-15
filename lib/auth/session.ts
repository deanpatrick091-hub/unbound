import "server-only";

import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Verifies the current request's session with getClaims() (cryptographic
 * JWT check — never trusts the raw cookie) and returns the user plus the
 * RLS-scoped client that produced it.
 */
export async function getSession(): Promise<{
  supabase: ServerSupabaseClient;
  user: SessionUser | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { supabase, user: null };

  const email = data.claims.email;
  return {
    supabase,
    user: { id: data.claims.sub, email: typeof email === "string" ? email : null },
  };
}

/** Convenience when only the user is needed. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getSession()).user;
}
