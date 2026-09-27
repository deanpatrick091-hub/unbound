/**
 * Canonical URL for this deployment. Never use a caller-controlled Origin or
 * forwarded host to build email links, and never point at localhost — a link
 * that only resolves on the developer's machine is broken for everyone who
 * receives it. Development builds use the production origin too: the dev
 * server still runs locally, it just sends real links.
 */
const PRODUCTION_ORIGIN = "https://unbound-lilac.vercel.app";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export function getSiteOrigin(env: Record<string, string | undefined> = process.env): string {
  const configured = env.SITE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();
  const candidate =
    configured ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + env.VERCEL_PROJECT_PRODUCTION_URL : undefined) ||
    PRODUCTION_ORIGIN;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("SITE_URL must be your HTTPS production origin, without a path.");
  }

  if (
    LOCAL_HOSTNAMES.has(url.hostname) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("SITE_URL must be your HTTPS production origin, without a path.");
  }
  return url.origin;
}
