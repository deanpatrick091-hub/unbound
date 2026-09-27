import "server-only";

import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@/lib/ai/types";
import { freeTierConfirmed } from "@/lib/ai/free-policy";

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
  zeroPriceOnly?: boolean;
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
      return apiKey && freeTierConfirmed("groq")
        ? { kind: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", apiKey, supportsStreamUsage: true }
        : null;
    }

    case "mistral": {
      const apiKey = env("MISTRAL_API_KEY");
      return apiKey && freeTierConfirmed("mistral") ? { kind: "openai-compatible", baseUrl: "https://api.mistral.ai/v1", apiKey, supportsStreamUsage: false } : null;
    }
    case "huggingface": {
      const apiKey = env("HF_TOKEN");
      return apiKey && freeTierConfirmed("huggingface") ? { kind: "openai-compatible", baseUrl: "https://router.huggingface.co/v1", apiKey, supportsStreamUsage: true } : null;
    }
    case "zai": {
      const apiKey = env("ZAI_API_KEY");
      return apiKey && freeTierConfirmed("zai") ? { kind: "openai-compatible", baseUrl: "https://api.z.ai/api/paas/v4", apiKey, supportsStreamUsage: false } : null;
    }
    case "cerebras": return null; // Expiring trial credits do not qualify.

    case "cloudflare": {
      const apiKey = env("CLOUDFLARE_API_TOKEN");
      const account = env("CLOUDFLARE_ACCOUNT_ID");
      if (!apiKey || !account || !/^[a-f0-9]{32}$/i.test(account) || !freeTierConfirmed("cloudflare")) return null;
      return { kind: "openai-compatible", baseUrl: "https://api.cloudflare.com/client/v4/accounts/" + account + "/ai/v1", apiKey, supportsStreamUsage: false };
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
        zeroPriceOnly: true,
      };
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
  if (provider === "cerebras") return "Cerebras is excluded because its free trial expires. Choose a free model from the library.";
  if ((provider === "groq" || provider === "cloudflare" || provider === "mistral" || provider === "huggingface" || provider === "zai") && !freeTierConfirmed(provider)) {
    return PROVIDER_LABELS[provider] + " is paused until the site owner verifies its free account tier. Choose another connected model.";
  }

  const envVar: Record<ProviderId, string> = {
    gemini: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    cloudflare: "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
    mistral: "MISTRAL_API_KEY",
    huggingface: "HF_TOKEN",
    zai: "ZAI_API_KEY",
    ollama: "OLLAMA_BASE_URL",
  };
  return `${PROVIDER_LABELS[provider]} isn't configured on the server. Set ${envVar[provider]}.`;
}
