import "server-only";

import { FEATURE_COST, LIMIT_MESSAGES, USAGE_LIMITS, type LimitReason } from "@/lib/limits/config";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

export type ConsumeResult =
  | {
      allowed: true;
      /** True when the limiter itself was unreachable and the request was let through unchecked. */
      degraded: boolean;
    }
  | { allowed: false; reason: LimitReason; message: string; retryAfterSeconds?: number };

function isLimitReason(value: unknown): value is LimitReason {
  return typeof value === "string" && value in LIMIT_MESSAGES;
}

/**
 * Atomically checks the caller's budgets and records the request. The user
 * identity comes from the session inside Postgres (auth.uid()), never from
 * the browser.
 *
 * Availability policy: a limiter that *runs* and says "over budget" denies
 * the request. A limiter that cannot run at all (function missing, database
 * unreachable) does not block chat — the request proceeds unmetered and the
 * outage is logged. Real provider rate limits are still surfaced by the
 * provider adapters.
 */
export async function consumeRequest(
  supabase: ServerSupabaseClient,
  feature: keyof typeof FEATURE_COST,
): Promise<ConsumeResult> {
  let data: unknown;
  try {
    const result = await supabase.rpc("consume_request", {
      p_feature: feature,
      p_units: FEATURE_COST[feature],
      p_per_minute: USAGE_LIMITS.unitsPerMinute,
      p_per_day: USAGE_LIMITS.unitsPerDay,
      p_per_month: USAGE_LIMITS.unitsPerMonth,
      p_tokens_per_day: USAGE_LIMITS.tokensPerDay,
      p_tokens_per_month: USAGE_LIMITS.tokensPerMonth,
    });
    if (result.error) throw new Error(result.error.message);
    data = result.data;
  } catch (error) {
    console.warn(
      "[limits] usage check unavailable — allowing request unmetered:",
      error instanceof Error ? error.message : error,
    );
    return { allowed: true, degraded: true };
  }

  const result = data as Record<string, unknown> | null;
  if (result?.allowed === true) return { allowed: true, degraded: false };

  const reason = isLimitReason(result?.reason) ? result.reason : "rate_limited";
  const retry = result?.retry_after_seconds;

  return {
    allowed: false,
    reason,
    message: LIMIT_MESSAGES[reason],
    retryAfterSeconds: typeof retry === "number" ? retry : undefined,
  };
}
