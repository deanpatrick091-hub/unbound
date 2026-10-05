import type {VideoJob} from '@/lib/videos/types';
import type { ProjectRow,HandleRow,MemberRow,InviteRow,FileRow,VersionRow,AssetRow,PinRow,IntegrationJobRow } from '@/lib/projects/types';
/**
 * Hand-maintained mirror of supabase/migrations. Keep in sync when the schema
 * changes (or replace with `supabase gen types typescript` output later).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "error" | "cancelled";
export type CouncilRole = "analyst" | "skeptic" | "optimist" | "contrarian" | "judge";
export type CouncilStatus = "running" | "complete" | "error" | "cancelled";
export type UsageFeature = "chat" | "council" | "build";

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPreferencesRow = {
  user_id: string;
  default_model: string;
  created_at: string;
  updated_at: string;
};

export type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  status: MessageStatus;
  created_at: string;
};

export type CouncilSessionRow = {
  id: string;
  user_id: string;
  title: string;
  question: string;
  model: string;
  status: CouncilStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CouncilOpinionRow = {
  model: string|null;
  error_message: string|null;
  id: string;
  session_id: string;
  user_id: string;
  role: CouncilRole;
  content: string;
  status: MessageStatus;
  created_at: string;
};

export type UsageRow = {
  id: string;
  user_id: string;
  feature: UsageFeature;
  conversation_id: string | null;
  council_session_id: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
};

export type RequestLogRow = {
  id: string;
  user_id: string;
  feature: string;
  units: number;
  created_at: string;
};

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      video_jobs: Table<VideoJob,'owner_id'|'prompt'|'aspect_ratio'>;
      projects: Table<ProjectRow, 'owner_id'|'model'>;
      user_handles: Table<HandleRow, 'user_id'|'username'|'display_name'>;
      project_members: Table<MemberRow, 'project_id'|'user_id'|'role'>;
      project_invites: Table<InviteRow, 'project_id'|'inviter_id'|'invitee_id'|'role'>;
      project_files: Table<FileRow, 'project_id'|'path'|'content'|'updated_by'>;
      project_versions: Table<VersionRow, 'project_id'|'revision'|'files'|'conversation'|'created_by'>;
      project_assets: Table<AssetRow, 'owner_id'|'prompt'|'provider'|'mime_type'|'data_url'>;
      pins: Table<PinRow, 'user_id'|'kind'>;
      integration_jobs: Table<IntegrationJobRow, 'user_id'|'provider'|'remote_id'>;
      profiles: Table<ProfileRow, "id">;
      user_preferences: Table<UserPreferencesRow, "user_id">;
      conversations: Table<ConversationRow, "user_id" | "model">;
      messages: Table<MessageRow, "conversation_id" | "user_id" | "role" | "content">;
      council_sessions: Table<CouncilSessionRow, "user_id" | "title" | "question" | "model">;
      council_opinions: Table<CouncilOpinionRow, "session_id" | "user_id" | "role">;
      usage: Table<UsageRow, "user_id" | "feature" | "model">;
      request_log: Table<RequestLogRow, "user_id" | "feature">;
    };
    Views: Record<string, never>;
    Functions: {
      save_project: { Args: {p_id:string;p_revision:number;p_files:Json;p_conversation:Json;p_model:string;p_settings?:Json;p_preview?:Json};Returns:number };
      accept_project_invite: { Args: {p_id:string};Returns:string };
      consume_request: {
        Args: {
          p_feature: string;
          p_units: number;
          p_per_minute: number;
          p_per_day: number;
          p_per_month: number;
          p_tokens_per_day: number;
          p_tokens_per_month: number;
        };
        Returns: Json;
      };
      usage_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
