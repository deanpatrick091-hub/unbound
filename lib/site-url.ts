/**
 * The canonical, absolute URL of this deployment.
 *
 * Everything user-facing that must be a full URL — Supabase confirmation and
 * password-reset links, OpenRouter attribution — goes through here, so links
 * never point at whatever host happened to serve the request.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL          — set this; it wins everywhere.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the stable production domain, set
 *                                      automatically by Vercel.
 *   3. VERCEL_URL                    — the per-deployment URL (preview builds).
 *
 * No localhost fallback: a missing value is a configuration error, not
 * something to paper over with a link that would break in email.
 */

function normalise(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;

  if (!configured?.trim()) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Set it to the deployment's URL (e.g. https://your-app.vercel.app) so email links resolve correctly.",
    );
  }
  return normalise(configured);
}

/** An absolute URL for a path on this site, e.g. siteUrl("/auth/confirm"). */
export function siteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
