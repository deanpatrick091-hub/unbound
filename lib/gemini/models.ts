/**
 * Compatibility shim — the catalog moved to lib/ai/models.ts when the
 * multi-provider system was added. Existing imports keep working.
 */
export {
  DEFAULT_MODEL_ID,
  MODEL_OPTIONS,
  isAllowedModel,
  resolveModel,
} from "@/lib/ai/models";
export type { ModelOption } from "@/lib/ai/types";
