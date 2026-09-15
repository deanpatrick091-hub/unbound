import "server-only";

import { FEATURE_COST, LIMIT_MESSAGES, USAGE_LIMITS, type LimitReason } from "@/lib/limits/config";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

export type ConsumeResult =
  | { allowed: true }
  | { allowed: false; reason: LimitReason; message: string; retryAfterSeconds?: number };

function isLimitReason(value: unknown): value is LimitReason {
  return typeof value === "string" && value in LIMIT_MESSAGES;
}

/**
 * Atomically checks the caller's budgets and records the request. The user
 * identity comes from the session inside Postgres (auth.uid()), never from
 * the browser. Fails closed: any unexpected error denies the request.
 */
export async function consumeRequest(
  supabase: ServerSupabaseClient,
  feature: keyof typeof FEATURE_COST,
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_request", {
    p_feature: feature,
    p_units: FEATURE_COST[feature],
    p_per_minute: USAGE_LIMITS.unitsPerMinute,
    p_per_day: USAGE_LIMITS.unitsPerDay,
    p_per_month: USAGE_LIMITS.unitsPerMonth,
    p_tokens_per_day: USAGE_LIMITS.tokensPerDay,
    p_tokens_per_month: USAGE_LIMITS.tokensPerMonth,
  });

  if (error) {
    console.error("[limits] consume_request failed:", error.message);
    return {
      allowed: false,
      reason: "rate_limited",
      message: "Usage checks are temporarily unavailable. Please try again shortly.",
      retryAfterSeconds: 10,
    };
  }

  const result = data as Record<string, unknown> | null;
  if (result?.allowed === true) return { allowed: true };

  const reason = isLimitReason(result?.reason) ? result.reason : "rate_limited";
  const retry = result?.retry_after_seconds;

  return {
    allowed: false,
    reason,
    message: LIMIT_MESSAGES[reason],
    retryAfterSeconds: typeof retry === "number" ? retry : undefined,
  };
}
