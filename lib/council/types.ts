/**
 * Shared Council types — safe for client import. Contains no prompts.
 */
import type { ChatErrorCode, TokenUsage } from "@/lib/chat/types";

export type CouncilRole = "analyst" | "skeptic" | "optimist" | "contrarian" | "judge";
export type CouncilMemberStatus = "pending" | "streaming" | "complete" | "error" | "cancelled";
export type CouncilSessionStatus = "running" | "complete" | "error" | "cancelled";

export const PERSPECTIVE_ROLES = ["analyst", "skeptic", "optimist", "contrarian"] as const;
export type PerspectiveRole = (typeof PERSPECTIVE_ROLES)[number];

/** Public-facing labels only. The system instructions are server-only. */
export const COUNCIL_MEMBERS: Record<CouncilRole, { label: string; tagline: string }> = {
  analyst: { label: "Analyst", tagline: "Structure, evidence, and trade-offs" },
  skeptic: { label: "Skeptic", tagline: "Risks, gaps, and failure modes" },
  optimist: { label: "Optimist", tagline: "Upside, momentum, and what could go right" },
  contrarian: { label: "Contrarian", tagline: "The strongest case against the obvious answer" },
  judge: { label: "Final Judge", tagline: "Weighs every perspective into a verdict" },
};

export interface CouncilRequestBody {
  question: string;
  model?: string;
  seatModels?: Partial<Record<PerspectiveRole,string>>;
}

export const COUNCIL_LIMITS = {
  maxQuestionLength: 4_000,
  maxTitleLength: 60,
} as const;

/** NDJSON events streamed from POST /api/council. */
export type CouncilStreamEvent =
  | {type:"member_model";role:CouncilRole;model:string}
  | { type: "session"; sessionId: string; title: string; model: string; persisted: boolean }
  | { type: "phase"; phase: "perspectives" | "judge" }
  | { type: "delta"; role: CouncilRole; text: string }
  | { type: "member_done"; role: CouncilRole; status: "complete" | "error" | "cancelled"; message?: string }
  | { type: "error"; code: ChatErrorCode; message: string }
  | { type: "done"; status: CouncilSessionStatus; usage?: TokenUsage };
