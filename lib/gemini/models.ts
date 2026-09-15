/**
 * Models the app allows. Safe to import on the client (no secrets) — the
 * server validates every requested id against this list.
 */
export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    id: "gemini-3.6-flash",
    label: "Flash",
    description: "Fast, balanced — the default.",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Flash Lite",
    description: "Lightest and quickest for simple tasks.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Pro (preview)",
    description: "Deeper reasoning; slower and quota-limited.",
  },
] as const;

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

export function isAllowedModel(id: unknown): id is string {
  return typeof id === "string" && MODEL_OPTIONS.some((m) => m.id === id);
}

/** Returns a safe model id: the requested one if allowed, otherwise the default. */
export function resolveModel(requested: unknown, fallback: string = DEFAULT_MODEL_ID): string {
  if (isAllowedModel(requested)) return requested;
  return isAllowedModel(fallback) ? fallback : DEFAULT_MODEL_ID;
}
