import { redirect } from "next/navigation";

import { ChatScreen } from "@/components/chat/chat-screen";
import { getSession } from "@/lib/auth/session";
import { getDefaultModelFor } from "@/lib/data/account";

export default async function NewChatPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const model = await getDefaultModelFor(supabase, user.id);

  return <ChatScreen conversationId={null} title={null} initialMessages={[]} model={model} />;
}
