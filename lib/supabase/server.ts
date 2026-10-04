import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Always create a fresh client per request — never cache it across requests.
 *
 * This client carries the *user's* session, so every query runs under RLS.
 * There is deliberately no service-role client anywhere in this codebase.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes sessions and writes cookies.
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
