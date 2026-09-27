
import { ChatScreen } from "@/components/chat/chat-screen";
import { getSession } from "@/lib/auth/session";
import { getDefaultModelFor } from "@/lib/data/account";
import { getAvailableModel } from "@/lib/ai/discovery";

export default async function NewChatPage({ searchParams }: PageProps<"/">) {
  const { supabase, user } = await getSession();
  if (!user) throw new Error("Workspace session unavailable.");

  const params = await searchParams;
  const chosen = typeof params.model === "string" ? await getAvailableModel(params.model) : undefined;
  const model = chosen?.id ?? await getDefaultModelFor(supabase, user.id);

  return <ChatScreen key={model} conversationId={null} title={null} initialMessages={[]} model={model} />;
}
