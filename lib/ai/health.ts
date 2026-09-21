import "server-only";

import type { ModelHealthState } from "@/lib/ai/types";

/**
 * Lightweight, in-process model health. Nothing here is persisted: it exists
 * so one bad experience with a model (a timeout, an empty reply, a 429)
 * steers the next few requests elsewhere, and so a provider's "this model is
 * restricted" verdict stops the picker from offering it.
 *
 * Every non-restricted state expires, after which the model is "available"
 * again and gets another chance. Restricted entries last much longer but
 * still expire, in case the provider changes its policy.
 */

interface HealthEntry {
  state: Exclude<ModelHealthState, "available">;
  until: number;
  reason: string;
}

const TTL_MS = {
  rate_limited: 90_000,
  busy: 5 * 60_000,
  unavailable: 5 * 60_000,
  restricted: 24 * 60 * 60_000,
} as const;

/** Longest provider-quoted wait we'll honour for a rate-limit entry. */
const MAX_RATE_LIMIT_TTL_MS = 10 * 60_000;

const health = new Map<string, HealthEntry>();

function set(id: string, state: HealthEntry["state"], ttlMs: number, reason: string): void {
  health.set(id, { state, until: Date.now() + ttlMs, reason });
}

export function getModelHealth(id: string): { state: ModelHealthState; reason?: string } {
  const entry = health.get(id);
  if (!entry) return { state: "available" };
  if (entry.until <= Date.now()) {
    health.delete(id);
    return { state: "available" };
  }
  return { state: entry.state, reason: entry.reason };
}

export function isModelUsable(id: string): boolean {
  return getModelHealth(id).state === "available";
}

export function isModelRestricted(id: string): boolean {
  return getModelHealth(id).state === "restricted";
}

/** 429: temporary. Uses the provider's own retry hint when it gave one. */
export function markRateLimited(id: string, reason: string, retryAfterMs?: number): void {
  const ttl = retryAfterMs ? Math.min(Math.max(retryAfterMs, 5_000), MAX_RATE_LIMIT_TTL_MS) : TTL_MS.rate_limited;
  set(id, "rate_limited", ttl, reason);
}

/** Overloaded: 5xx, or no first token within the window. */
export function markBusy(id: string, reason: string): void {
  set(id, "busy", TTL_MS.busy, reason);
}

/** Answered successfully but with nothing in it. */
export function markUnavailable(id: string, reason: string): void {
  set(id, "unavailable", TTL_MS.unavailable, reason);
}

/** 403 "only available on …": the provider won't serve this client. */
export function markRestricted(id: string, reason: string): void {
  set(id, "restricted", TTL_MS.restricted, reason);
}

/** A good reply clears any temporary state (never clears "restricted"). */
export function markHealthy(id: string): void {
  const entry = health.get(id);
  if (entry && entry.state !== "restricted") health.delete(id);
}

/** For tests and diagnostics. */
export function resetHealth(): void {
  health.clear();
}
