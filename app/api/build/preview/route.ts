import type { NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { assembleDocument, PREVIEW_SANDBOX } from "@/lib/build/assemble";
import { BUILD_LIMITS, isSiteFileName, type SiteFiles } from "@/lib/build/types";

/**
 * POST /api/build/preview — "Open preview in a new tab".
 *
 * The client form-POSTs the site files; the response is the assembled page
 * served with a `Content-Security-Policy: sandbox …` HEADER. That gives the
 * document an opaque origin even though it comes from UNBOUND's domain, so
 * generated code gets no cookies, no localStorage and no credentialed
 * requests — the same isolation as the in-app iframe. (A blob: URL would
 * have been same-origin with the app; this deliberately isn't.)
 */
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in to preview.", { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request.", { status: 400 });
  }

  const files: SiteFiles = {};
  let bytes = 0;
  for (const [name, value] of form.entries()) {
    if (!isSiteFileName(name) || typeof value !== "string") continue;
    bytes += value.length;
    if (bytes > BUILD_LIMITS.maxSiteBytes) return new Response("Site too large.", { status: 413 });
    files[name] = value;
  }
  if (!files["index.html"]) return new Response("Nothing to preview.", { status: 400 });

  return new Response(assembleDocument(files), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `sandbox ${PREVIEW_SANDBOX}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
