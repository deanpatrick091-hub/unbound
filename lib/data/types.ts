export type {
  ConversationRow,
  CouncilOpinionRow,
  CouncilRole,
  CouncilSessionRow,
  CouncilStatus,
  MessageRow,
  MessageStatus,
  ProfileRow,
  UsageFeature,
  UserPreferencesRow,
} from "@/lib/supabase/database.types";

import type { UsageFeature } from "@/lib/supabase/database.types";

export interface TokenUsageInsert {
  userId: string;
  feature: UsageFeature;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  conversationId?: string | null;
  councilSessionId?: string | null;
}
