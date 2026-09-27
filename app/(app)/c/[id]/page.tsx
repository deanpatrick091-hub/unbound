import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChatScreen } from "@/components/chat/chat-screen";
import { getSession } from "@/lib/auth/session";
import type { ChatMessage } from "@/lib/chat/types";
import { isUuid } from "@/lib/chat/validation";
import { getConversation, listMessages } from "@/lib/data/conversations";
import { resolveModel } from "@/lib/gemini/models";

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "UNBOUND" };
  const { user, supabase } = await getSession();
  if (!user) return { title: "UNBOUND" };
  const conversation = await getConversation(supabase, id).catch(() => null);
  return { title: conversation ? `${conversation.title} · UNBOUND` : "UNBOUND" };
}

export default async function ConversationPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { supabase, user } = await getSession();
  if (!user) throw new Error("Workspace session unavailable.");

  // RLS: another user's conversation id simply returns null here.
  const conversation = await getConversation(supabase, id);
  if (!conversation) notFound();

  const rows = await listMessages(supabase, id);
  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: Date.parse(m.created_at),
    status: m.status,
  }));

  return (
    <ChatScreen
      key={conversation.id}
      conversationId={conversation.id}
      title={conversation.title}
      initialMessages={messages}
      model={resolveModel(conversation.model)}
    />
  );
}
