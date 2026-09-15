/**
 * Public Supabase configuration.
 *
 * Both values are intentionally NEXT_PUBLIC_: the project URL and the
 * *publishable* key are designed to ship to the browser — Row Level Security
 * is what protects data, not key secrecy. The service-role key must never be
 * referenced here or anywhere in this codebase.
 */
export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}
