import type { ChatErrorCode } from "@/lib/chat/types";
import {
  PERSPECTIVE_ROLES,
  type CouncilMemberStatus,
  type CouncilRole,
  type CouncilSessionStatus,
} from "@/lib/council/types";

export interface CouncilMemberState {
  text: string;
  status: CouncilMemberStatus;
  message?: string;
  model?: string;
}

export type CouncilMembers = Record<CouncilRole, CouncilMemberState>;

export interface CouncilState {
  sessionId: string | null;
  question: string;
  model: string | null;
  phase: "idle" | "perspectives" | "judge" | "finished";
  status: CouncilSessionStatus | "idle";
  members: CouncilMembers;
  error: { code: ChatErrorCode; message: string } | null;
}

export const ALL_COUNCIL_ROLES: CouncilRole[] = [...PERSPECTIVE_ROLES, "judge"];

export function emptyMembers(status: CouncilMemberStatus = "pending"): CouncilMembers {
  return Object.fromEntries(ALL_COUNCIL_ROLES.map((r) => [r, { text: "", status }])) as CouncilMembers;
}

export const INITIAL_COUNCIL_STATE: CouncilState = {
  sessionId: null,
  question: "",
  model: null,
  phase: "idle",
  status: "idle",
  members: emptyMembers(),
  error: null,
};
