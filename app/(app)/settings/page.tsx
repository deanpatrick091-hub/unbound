import {IdentityForm} from "@/components/projects/identity-form";
import type { Metadata } from "next";

import { PreferencesForm, ProfileForm } from "@/components/settings/settings-forms";
import { UsagePanel } from "@/components/settings/usage-panel";
import { AppearanceControls } from "@/components/appearance/appearance";
import { getAvailableModels } from "@/lib/ai/discovery";
import { DEFAULT_MODEL_ID, resolveModel } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { getPreferences, getProfile, getUsageSummary } from "@/lib/data/account";

export const metadata: Metadata = { title: "Settings · UNBOUND" };

export default async function SettingsPage() {
  // The proxy guarantees an (anonymous) session before this renders.
  const { supabase, user } = await getSession();
  if (!user) return <SessionUnavailable />;

  const {data:handle}=await supabase.from('user_handles').select('*').eq('user_id',user.id).maybeSingle();
  const {data:auth}=await supabase.auth.getUser();
  const [profile, prefs, usage, models] = await Promise.all([
    getProfile(supabase, user.id).catch(() => null),
    getPreferences(supabase, user.id).catch(() => null),
    getUsageSummary(supabase).catch(() => null),
    getAvailableModels().catch(() => []),
  ]);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="animate-rise-in">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">Account</p>
          <h1 className="mt-3 text-2xl font-medium tracking-tight">Settings</h1>
        </header>

        <div className="mt-10 space-y-10">
          <Section title="Appearance" description="Your theme and personal chat background.">
            <AppearanceControls />
          </Section>
          <Section title="Identity & access" description="Choose a username and keep access across devices."><IdentityForm initial={handle} userId={user.id} anonymous={!!auth.user?.is_anonymous}/></Section>
          <Section title="Profile" description="How you appear inside UNBOUND.">
            <ProfileForm displayName={profile?.display_name ?? null} />
          </Section>

          <Section title="Preferences" description="Defaults for new conversations.">
            <PreferencesForm defaultModel={resolveModel(prefs?.default_model, DEFAULT_MODEL_ID)} models={models} />
          </Section>

          <Section title="Usage" description="Free-plan budgets reset daily and monthly (UTC).">
            <UsagePanel usage={usage} />
          </Section>

          <Section title="This browser" description="How your workspace is kept.">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your conversations and builds are private to your account. Guest sessions belong to this browser until you link an email. Clearing browser data before linking can lose access to your guest workspace.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Shown only if the anonymous session could not be created (Supabase unreachable). */
function SessionUnavailable() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Your workspace isn&apos;t available right now. Reload the page to try again.
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 border-t pt-8 sm:grid-cols-[180px_1fr] animate-rise-in">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
