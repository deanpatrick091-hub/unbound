import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { ShellProvider } from "@/components/shell/shell-context";
import { getAvailableModels, getProviderStatuses } from "@/lib/ai/discovery";
import { getSession } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/account";
import { listConversations } from "@/lib/data/conversations";
import { listCouncilSessions } from "@/lib/data/council";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // proxy.ts already redirects anonymous visitors; this is defence in depth.
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const [conversations, councilSessions, profile, models, providers] = await Promise.all([
    listConversations(supabase).catch(() => []),
    listCouncilSessions(supabase).catch(() => []),
    getProfile(supabase, user.id).catch(() => null),
    // Only ids/labels/health cross to the client — never keys or config.
    getAvailableModels().catch(() => []),
    getProviderStatuses().catch(() => []),
  ]);

  return (
    <ShellProvider
      user={{ id: user.id, email: user.email, displayName: profile?.display_name ?? null }}
      models={models}
      providers={providers}
      initialConversations={conversations}
      initialCouncilSessions={councilSessions}
    >
      <AppShell>{children}</AppShell>
    </ShellProvider>
  );
}
