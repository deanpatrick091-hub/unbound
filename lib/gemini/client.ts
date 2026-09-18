import "server-only";

import { GoogleGenAI } from "@google/genai";

import { DEFAULT_MODEL_ID, resolveModel } from "@/lib/ai/models";

/**
 * Server-only Gemini client.
 *
 * The `server-only` import makes any accidental client-side import a build
 * error, so GEMINI_API_KEY can never reach the browser bundle.
 */

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set.");
    this.name = "GeminiNotConfiguredError";
  }
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/** Server default model: GEMINI_MODEL if set and allowed, else the app default. */
export function getDefaultModel(): string {
  return resolveModel(process.env.GEMINI_MODEL?.trim(), DEFAULT_MODEL_ID);
}
