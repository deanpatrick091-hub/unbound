/**
 * Usage protection for the free prototype.
 *
 * All limits are enforced server-side inside the Postgres function
 * `consume_request()` (see supabase/migrations). These constants are passed
 * to it on every call, so changing a number here is all that's needed.
 *
 * "Units" = model calls. A chat turn costs 1; a Council run costs 5
 * (four perspectives + the judge).
 */
export const USAGE_LIMITS = {
  /** Burst protection against scripted abuse. */
  unitsPerMinute: 12,
  /** Daily / monthly request budgets per user. */
  unitsPerDay: 150,
  unitsPerMonth: 2_000,
  /** Token budgets per user (sum of prompt + completion tokens). */
  tokensPerDay: 400_000,
  tokensPerMonth: 5_000_000,
} as const;

export const FEATURE_COST = {
  chat: 1,
  council: 5,
  build: 1,
} as const;

export type LimitReason =
  | "rate_limited"
  | "daily_limit"
  | "monthly_limit"
  | "daily_token_limit"
  | "monthly_token_limit";

export const LIMIT_MESSAGES: Record<LimitReason, string> = {
  rate_limited: "You're sending requests too quickly. Please wait a moment and try again.",
  daily_limit: "You've reached today's request limit on the free plan. It resets at midnight UTC.",
  monthly_limit: "You've reached this month's request limit on the free plan.",
  daily_token_limit: "You've used today's token budget on the free plan. It resets at midnight UTC.",
  monthly_token_limit: "You've used this month's token budget on the free plan.",
};
