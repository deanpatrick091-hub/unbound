import "server-only";

import type { ModelHealth, ModelHealthState } from "@/lib/ai/types";

/**
 * Lightweight, in-process model health. Nothing here is persisted: a state
 * expires on its own, so a model that recovers becomes usable again without
 * any manual reset. Keys are qualified model ids (`provider:model`).
 *
 *  available    — no known problem
 *  busy         — slow or empty recently; still selectable, skipped as a fallback
 *  rate_limited — 429 recently; still selectable, skipped as a fallback
 *  unavailable  — timed out / empty twice; hidden from fallback, flagged in picker
 *  restricted   — provider refuses it for this client (403); hidden entirely
 */

interface Entry {
  state: ModelHealthState;
  reason: string;
  until: number;
  /** Consecutive soft failures (empty/timeout) — escalates busy → unavailable. */
  strikes: number;
}

const TTL_MS: Record<Exclude<ModelHealthState, "available">, number> = {
  busy: 90_000,
  rate_limited: 60_000,
  unavailable: 3 * 60_000,
  restricted: 12 * 60 * 60_000,
};

const entries = new Map<string, Entry>();

/** Provider-wide states (e.g. an account's daily free quota), keyed by provider id. */
const providerEntries = new Map<string, Entry>();

function liveIn(map: Map<string, Entry>, key: string): Entry | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry;
}

function live(id: string): Entry | null {
  return liveIn(entries, id);
}

export function getModelHealth(id: string): ModelHealth {
  const entry = live(id);
  // A policy restriction on the model outranks any provider-wide state.
  if (entry?.state === "restricted") return { state: entry.state, reason: entry.reason };
  const provider = liveIn(providerEntries, id.slice(0, id.indexOf(":")));
  if (provider) return { state: provider.state, reason: provider.reason };
  return entry ? { state: entry.state, reason: entry.reason } : { state: "available" };
}

/**
 * An account-wide allowance is exhausted (e.g. OpenRouter's free-models-per-day).
 * Every model of that provider reads as rate_limited until it expires, and
 * fallback within the provider is pointless, so callers skip it.
 */
export function markProviderQuotaExhausted(provider: string, reason: string, ttlMs = 15 * 60_000): void {
  providerEntries.set(provider, { state: "rate_limited", reason, until: Date.now() + ttlMs, strikes: 0 });
}

export function isProviderQuotaExhausted(provider: string): boolean {
  return liveIn(providerEntries, provider) !== null;
}

/** A 429: the model is fine, the pool is busy. Never removes the model. */
export function markRateLimited(id: string, reason = "Rate limited a moment ago"): void {
  const prior = live(id);
  entries.set(id, { state: "rate_limited", reason, until: Date.now() + TTL_MS.rate_limited, strikes: prior?.strikes ?? 0 });
}

/** A soft failure (empty completion, no first token in time). Two in a row → unavailable. */
export function markSoftFailure(id: string, reason: string): ModelHealthState {
  const prior = live(id);
  const strikes = (prior?.strikes ?? 0) + 1;
  const state: ModelHealthState = strikes >= 2 ? "unavailable" : "busy";
  entries.set(id, { state, reason, until: Date.now() + TTL_MS[state], strikes });
  return state;
}

/** A 403 that says the provider won't serve this model to us. Hidden from the picker. */
export function markRestricted(id: string, reason: string): void {
  entries.set(id, { state: "restricted", reason, until: Date.now() + TTL_MS.restricted, strikes: 0 });
}

/** A successful reply clears everything for the model — and any provider-wide quota flag. */
export function markHealthy(id: string): void {
  entries.delete(id);
  providerEntries.delete(id.slice(0, id.indexOf(":")));
}

/** Whether the model should be offered as an automatic fallback right now. */
export function isFallbackCandidate(id: string): boolean {
  return getModelHealth(id).state === "available";
}

export function isRestricted(id: string): boolean {
  return getModelHealth(id).state === "restricted";
}
