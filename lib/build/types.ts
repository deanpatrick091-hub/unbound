/**
 * Shared website-builder types. Safe for client import — no secrets.
 */
import type { ChatErrorCode, ChatRole, TokenUsage } from "@/lib/chat/types";

/** Files a generated site may contain. Fixed set keeps the sandbox simple. */
export const SITE_FILE_NAMES = ["index.html", "styles.css", "script.js"] as const;
export type SiteFileName = (typeof SITE_FILE_NAMES)[number];

export type SiteFiles = Partial<Record<SiteFileName, string>>;

export function isSiteFileName(value: unknown): value is SiteFileName {
  return typeof value === "string" && (SITE_FILE_NAMES as readonly string[]).includes(value);
}

export const BUILD_LIMITS = {
  maxInstructionLength: Number.POSITIVE_INFINITY,
  /** Total bytes of site files accepted from the client / produced by the model. */
  maxSiteBytes: 400_000,
  /** Prior builder turns sent to the model as context. */
  contextTurns: 12,
} as const;

export interface BuildHistoryTurn {
  role: ChatRole;
  content: string;
}

export interface BuildRequestBody {
  instruction: string;
  projectId?: string;
  revision?: number;
  /** The site as it currently exists in the workspace (empty for a fresh build). */
  files: SiteFiles;
  model?: string;
  history?: BuildHistoryTurn[];
}

/** NDJSON events streamed from POST /api/build. */
export type BuildStreamEvent =
  | { type: "meta"; model: string }
  /** Conversational text from the model (streamed before/between file blocks). */
  | { type: "text"; text: string }
  | { type: "file_start"; name: SiteFileName }
  | { type: "file"; name: SiteFileName; content: string }
  | { type: "model_switched"; from: string; to: string; reason: string }
  | { type: "error"; code: ChatErrorCode; message: string }
  | { type: "done"; usage?: TokenUsage; model: string; revision?:number };

/** Markers the model uses to delimit files. Exact-match, one per line. */
export const FILE_START = /^<<<FILE\s+([A-Za-z0-9._-]+)>>>\s*$/;
export const FILE_END = /^<<<END>>>\s*$/;
