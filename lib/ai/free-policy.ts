/** Cost policy shared by discovery and regression tests. */
export function hasZeroPricing(pricing: Record<string, unknown> | undefined): boolean {
  if (!pricing || pricing.prompt === undefined || pricing.completion === undefined) return false;
  return Object.values(pricing).every(value =>
    (typeof value === "string" && value.trim() !== "" || typeof value === "number") &&
    Number.isFinite(Number(value)) && Number(value) === 0);
}

// A free model name does not turn a paid account into a free account.
// Providers without a per-request $0 ceiling need owner verification.
export function freeTierConfirmed(provider: "gemini" | "groq" | "cloudflare" | "mistral" | "huggingface" | "zai"): boolean {
  return process.env[provider.toUpperCase() + "_FREE_TIER_CONFIRMED"] === "true";
}

export const GEMMA_FREE_MODELS = ["gemma-4-26b-a4b-it", "gemma-4-31b-it"] as const;
export const ZAI_FREE_MODELS = ["glm-4.7-flash", "glm-4.5-flash", "glm-4.6v-flash"] as const;

export const GEMINI_FREE_MODELS = [
  ...GEMMA_FREE_MODELS,
  "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
  "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
  // Google restricts 2.5 endpoints to legacy users; both return 404 for this project.
  // Verified 2026-09-28. Use the supported 3.x models above.
  // https://ai.google.dev/gemini-api/docs/deprecations
] as const;

// Standard models included in the Workers Free daily allowance.
// Paid-only partner/frontier models are deliberately excluded.
export const CLOUDFLARE_FREE_MODELS = [
  "@cf/meta/llama-3.2-1b-instruct", "@cf/meta/llama-3.2-3b-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/qwen/qwen3.8-27b",
  "@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b", "@cf/ibm-granite/granite-4.0-h-micro",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it", "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/qwen/qwq-32b", "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
] as const;

// The live provider explicitly refused these models for a general chat app on
// 2026-09-26 (agentic-harness-only access). Do not advertise nonfunctional tiles.
export const RESTRICTED_MODEL_IDS = new Set([
  "openrouter:thinkingmachines/inkling:free",
  "openrouter:thinkingmachines/inkling-small:free",
]);
