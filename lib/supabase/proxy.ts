import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

/** Routes reachable without a session. Everything else requires login. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth"];

/** Routes a signed-in user should be bounced away from (back to the app). */
const AUTH_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every matched request and enforces
 * the app's auth boundary. Must run before any Server Component renders so
 * that refreshed tokens are available to them and written back to the browser.
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
  const isAuthenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isAuthenticated && !matchesPrefix(pathname, PUBLIC_PATHS)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Sign in to continue." } },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && matchesPrefix(pathname, AUTH_ONLY_PATHS)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  // Return the response that carries any refreshed cookies. Creating a new
  // response here would drop them and cause random sign-outs.
  return response;
}
