import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ShellProvider } from "@/components/shell/shell-context";
import { getAvailableModels } from "@/lib/ai/discovery";
import { getSession } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/account";
import { listConversations } from "@/lib/data/conversations";
import { listCouncilSessions } from "@/lib/data/council";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // proxy.ts signs every visitor in anonymously before this renders. A missing
  // user therefore means Supabase is unreachable or anonymous sign-ins are
  // disabled — say so plainly rather than sending anyone to a login that
  // no longer exists.
  const { supabase, user } = await getSession();
  let accountHandle: {display_name: string} | null = null;
  if (process.env.USERNAME_AUTH_ENABLED === "true") {
    const { data: { user: identity } } = await supabase.auth.getUser();
    if (!identity || identity.is_anonymous) redirect("/login");
    const { data: handle } = await supabase.from("user_handles").select("display_name").eq("user_id", identity.id).maybeSingle();
    if (!handle) redirect("/login");
    accountHandle = handle;
  }
  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-medium tracking-tight">Workspace unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            UNBOUND couldn&apos;t start a session. Reload the page to try again.
          </p>
        </div>
      </div>
    );
  }

  const [conversations, councilSessions, profile, models] = await Promise.all([
    listConversations(supabase).catch(() => []),
    listCouncilSessions(supabase).catch(() => []),
    getProfile(supabase, user.id).catch(() => null),
    // Only ids/labels cross to the client — never keys or config.
    getAvailableModels().catch(() => []),
  ]);

  return (
    <ShellProvider
      user={{ id: user.id, email: user.email?.endsWith("@accounts.unbound.invalid") ? null : user.email, displayName: profile?.display_name ?? accountHandle?.display_name ?? null }}
      models={models}
      initialConversations={conversations}
      initialCouncilSessions={councilSessions}
    >
      <AppShell>{children}</AppShell>
    </ShellProvider>
  );
}
