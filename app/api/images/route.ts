import { getSession } from "@/lib/auth/session";
import { errorResponse, limitResponse } from "@/lib/api/responses";
import { getProviderConfig } from "@/lib/ai/providers";
import { consumeRequest } from "@/lib/limits/consume";

export const maxDuration = 60;
export async function POST(request: Request) {
  const { supabase, user } = await getSession();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to continue.");
  const config = getProviderConfig("cloudflare");
  if (!config || config.kind !== "openai-compatible") return errorResponse(503, "not_configured", "A Cloudflare Workers Free connection is needed for images.");
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse(400, "invalid_request", "Enter an image description."); }
  const prompt = (body as { prompt?: unknown } | null)?.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2048) return errorResponse(400, "invalid_request", "Use a description between 1 and 2,048 characters.");
  // Image creation shares the existing creation budget; no unmetered new feature.
  const limit = await consumeRequest(supabase, "build");
  if (!limit.allowed) return limitResponse(limit);
  if (limit.degraded) return errorResponse(503, "upstream_error", "The usage check is temporarily unavailable. Please try again shortly.");
  try {
    const response = await fetch(config.baseUrl.replace(/\/v1$/, "/run/@cf/black-forest-labs/flux-1-schnell"), {
      method: "POST", headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim(), steps: 4 }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
    });
    if (response.status === 429) return errorResponse(429, "rate_limited", "The free image allowance is busy or used up. Please try again later.");
    if (!response.ok) return errorResponse(502, "upstream_error", "The image provider could not complete this request. Please try another description or try again later.");
    const data = await response.json();
    const image = data.result?.image;
    if (data.success === false || typeof image !== "string" || image.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return errorResponse(502, "upstream_error", "The image provider returned an invalid image.");
    return Response.json({ src: "data:image/jpeg;base64," + image }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return errorResponse(502, "network_error", "The image request was interrupted. Please try again."); }
}
