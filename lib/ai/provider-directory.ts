import {ADDITIONAL_CHAT} from "@/lib/ai/additional-chat";
import type { ProviderId } from "./types";
/** Public descriptions only. A connection appears in the picker after server checks. */
export const PROVIDER_DIRECTORY: { id: ProviderId; label: string; allowance: string }[] = [
  ...Object.entries(ADDITIONAL_CHAT).map(([id,p])=>({id:id as ProviderId,label:p.label,allowance:p.allowance})),
  { id: "openrouter", label: "OpenRouter", allowance: "Live zero-priced chat models. Shared request limits apply." },
  { id: "gemini", label: "Google Gemini", allowance: "Gemma 4 is free. Flash models require a verified Gemini Free-tier account." },
  { id: "groq", label: "Groq", allowance: "Fast chat models with a recurring free allowance." },
  { id: "cloudflare", label: "Cloudflare", allowance: "18 chat models and FLUX images. Workers Free includes 10,000 neurons daily." },
  { id: "mistral", label: "Mistral", allowance: "A recurring Free-mode allowance with pay-as-you-go turned off." },
  { id: "huggingface", label: "Hugging Face", allowance: "A broad model catalog sharing a small $0.10 monthly free credit." },
  { id: "zai", label: "Z.ai", allowance: "GLM-4.7-Flash, GLM-4.5-Flash and GLM-4.6V-Flash at zero token price." },
  { id: "ollama", label: "Ollama", allowance: "Your installed local models. Uses your own computer; no per-token API charge." },
];
