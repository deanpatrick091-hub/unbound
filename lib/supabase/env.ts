/**
 * Public Supabase configuration.
 *
 * Both values are intentionally NEXT_PUBLIC_: the project URL and the
 * *publishable* key are designed to ship to the browser — Row Level Security
 * is what protects data, not key secrecy. The service-role key must never be
 * referenced here or anywhere in this codebase.
 */
export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  // Never include configured values in errors: this code also runs in browsers.
  let projectUrl: URL;
  try {
    projectUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid project URL.");
  }
  if (
    !["https:", "http:"].includes(projectUrl.protocol) ||
    projectUrl.username || projectUrl.password || projectUrl.search ||
    projectUrl.hash || projectUrl.pathname !== "/" ||
    (process.env.NODE_ENV === "production" && projectUrl.protocol !== "https:")
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the project HTTPS origin.");
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    // Legacy compatibility is limited to public anon keys, never service-role
    // keys or user access tokens. This is format validation, not verification.
    let claims: { role?: string; ref?: string } | null = null;
    try {
      const parts = publishableKey.split(".");
      if (parts.length === 3) {
        const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
      }
    } catch {
      // Invalid public configuration is reported without echoing its value.
    }
    if (claims?.role !== "anon") {
      throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a public publishable or legacy anon key.");
    }
    const hostedRef = projectUrl.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
    if (hostedRef && claims.ref !== hostedRef) {
      throw new Error("The public Supabase key and project URL belong to different projects.");
    }
  }

  return { url, publishableKey };
}
