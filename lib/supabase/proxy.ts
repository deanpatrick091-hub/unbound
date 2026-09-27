import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Keeps every visitor signed in — silently.
 *
 * UNBOUND has no login. Instead, the first request from a new browser creates
 * an anonymous Supabase user and stores its session in cookies, so the app is
 * usable immediately with nothing to fill in. That anonymous user is still a
 * real `auth.uid()`, which is what every Row Level Security policy and the
 * `consume_request()` rate limiter key off: conversations stay private to the
 * browser that created them, and per-user usage limits still apply.
 *
 * Must run before any Server Component renders so the session cookie exists
 * for them and is written back to the browser.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write to the request (for downstream Server Components) and to the
        // response (for the browser).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not put logic between createServerClient and getClaims().
  // getClaims() verifies the JWT signature and triggers the token refresh.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    // No session yet (or it expired): mint an anonymous one. signInAnonymously
    // writes its cookies through setAll above, so `response` carries them.
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Anonymous sign-ins disabled in the project, or Supabase unreachable.
      // Let the request through; pages and routes degrade on their own rather
      // than trapping the visitor on an error screen.
      console.error("[auth] anonymous sign-in failed:", error.message);
    }
  }

  // Return the response that carries any new or refreshed cookies. Creating a
  // new response here would drop them and cause a fresh user on every request.
  return response;
}
