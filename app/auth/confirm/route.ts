import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "signup",
  "email",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
]);

/**
 * GET /auth/confirm
 *
 * Landing point for links in Supabase auth emails. Supports both link styles:
 *  - `?token_hash=…&type=…` (custom email template, recommended by Supabase)
 *  - `?code=…`              (default template via the PKCE flow)
 *
 * On success the session cookie is set and the user is sent to `next` (or `/`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) return redirectTo(request, next);
    return redirectWithError(request, error.message);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(request, next);
    return redirectWithError(request, error.message);
  }

  return redirectWithError(request, "This confirmation link is invalid or has expired.");
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectWithError(request: NextRequest, message: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
