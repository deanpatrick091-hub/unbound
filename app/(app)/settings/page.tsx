import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PasswordForm, PreferencesForm, ProfileForm } from "@/components/settings/settings-forms";
import { UsagePanel } from "@/components/settings/usage-panel";
import { AppearanceControls } from "@/components/appearance/appearance";
import { getAvailableModels } from "@/lib/ai/discovery";
import { DEFAULT_MODEL_ID, resolveModel } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { getPreferences, getProfile, getUsageSummary } from "@/lib/data/account";

export const metadata: Metadata = { title: "Settings · UNBOUND" };

export default async function SettingsPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

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
          <Section title="Profile" description="How you appear inside UNBOUND.">
            <p className="mb-4 text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{user.email ?? "—"}</span>
            </p>
            <ProfileForm displayName={profile?.display_name ?? null} />
          </Section>

          <Section title="Preferences" description="Defaults for new conversations.">
            <PreferencesForm defaultModel={resolveModel(prefs?.default_model, DEFAULT_MODEL_ID)} models={models} />
          </Section>

          <Section title="Usage" description="Free-plan budgets reset daily and monthly (UTC).">
            <UsagePanel usage={usage} />
          </Section>

          <Section title="Password" description="Choose a new password for your account.">
            <PasswordForm />
          </Section>

          <Section title="Session" description="Sign out on this device.">
            <SignOutButton className="h-9 rounded-md border border-border-strong px-4 text-foreground" />
          </Section>
        </div>
      </div>
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
