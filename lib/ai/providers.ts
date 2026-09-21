import "server-only";

import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@/lib/ai/types";

/**
 * Server-only provider configuration. API keys are read here and only here;
 * nothing in this module is ever serialised to the client except the
 * boolean "enabled" flags via getEnabledProviders().
 */

export interface OpenAICompatibleConfig {
  kind: "openai-compatible";
  baseUrl: string;
  apiKey: string | null;
  extraHeaders?: Record<string, string>;
  /** Whether the provider honours `stream_options.include_usage`. */
  supportsStreamUsage: boolean;
}

export interface GeminiConfig {
  kind: "gemini";
}

export type ProviderConfig = OpenAICompatibleConfig | GeminiConfig;

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Returns the provider's config, or null when it isn't configured. */
export function getProviderConfig(provider: ProviderId): ProviderConfig | null {
  switch (provider) {
    case "gemini":
      return env("GEMINI_API_KEY") ? { kind: "gemini" } : null;

    case "groq": {
      const apiKey = env("GROQ_API_KEY");
      return apiKey
        ? { kind: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", apiKey, supportsStreamUsage: true }
        : null;
    }

    case "cerebras": {
      const apiKey = env("CEREBRAS_API_KEY");
      return apiKey
        ? { kind: "openai-compatible", baseUrl: "https://api.cerebras.ai/v1", apiKey, supportsStreamUsage: true }
        : null;
    }

    case "openrouter": {
      const apiKey = env("OPENROUTER_API_KEY");
      if (!apiKey) return null;
      const extraHeaders: Record<string, string> = {};
      const site = env("OPENROUTER_SITE_URL");
      const app = env("OPENROUTER_APP_NAME");
      if (site) extraHeaders["HTTP-Referer"] = site;
      if (app) extraHeaders["X-Title"] = app;
      return {
        kind: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey,
        extraHeaders,
        supportsStreamUsage: true,
      };
    }

    case "huggingface": {
      const apiKey = env("HF_TOKEN");
      return apiKey
        ? { kind: "openai-compatible", baseUrl: "https://router.huggingface.co/v1", apiKey, supportsStreamUsage: true }
        : null;
    }

    case "ollama": {
      const base = env("OLLAMA_BASE_URL");
      if (!base) return null;
      return {
        kind: "openai-compatible",
        baseUrl: `${base.replace(/\/+$/, "")}/v1`,
        apiKey: null,
        supportsStreamUsage: true,
      };
    }
  }
}

export function isProviderEnabled(provider: ProviderId): boolean {
  return getProviderConfig(provider) !== null;
}

export function getEnabledProviders(): ProviderId[] {
  return PROVIDER_IDS.filter(isProviderEnabled);
}

export function providerNotConfiguredMessage(provider: ProviderId): string {
  const envVar: Record<ProviderId, string> = {
    gemini: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    huggingface: "HF_TOKEN",
    ollama: "OLLAMA_BASE_URL",
  };
  // Logged detail names the variable; the user sees the short form.
  console.warn(`[providers] ${PROVIDER_LABELS[provider]} not configured (set ${envVar[provider]})`);
  return provider === "ollama"
    ? "Ollama's local server is offline."
    : `${PROVIDER_LABELS[provider]} hasn't been configured yet.`;
}
