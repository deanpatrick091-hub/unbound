"use client";

import { useActionState, useId } from "react";

import { updatePassword, updatePreferences, updateProfile, type AuthActionState } from "@/app/(auth)/actions";
import { Feedback } from "@/components/auth/feedback";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { describeModel, groupByProvider, qualifyModelId } from "@/lib/ai/models";
import type { ModelOption } from "@/lib/ai/types";

const EMPTY: AuthActionState = {};

export function ProfileForm({ displayName }: { displayName: string | null }) {
  const [state, action, pending] = useActionState(updateProfile, EMPTY);
  return (
    <form action={action} className="space-y-4">
      <Field
        label="Display name"
        name="display_name"
        defaultValue={displayName ?? ""}
        maxLength={80}
        autoComplete="nickname"
        placeholder="How should we address you?"
        disabled={pending}
      />
      <Feedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-auto px-5" variant="secondary">
        Save
      </SubmitButton>
    </form>
  );
}

export function PreferencesForm({
  defaultModel,
  models,
}: {
  defaultModel: string;
  models: readonly ModelOption[];
}) {
  const [state, action, pending] = useActionState(updatePreferences, EMPTY);
  const selectId = useId();
  const current = qualifyModelId(defaultModel);
  const known = models.some((m) => m.id === current);
  const described = describeModel(current, models);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={selectId} className="text-[13px] text-muted-foreground">
          Default provider and model
        </label>
        <select
          id={selectId}
          name="default_model"
          defaultValue={current}
          disabled={pending || models.length === 0}
          aria-describedby={`${selectId}-hint`}
          className="h-10 w-full rounded-md border border-border bg-background/40 px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {!known ? (
            <option value={current} className="bg-raised">
              {described.providerLabel} · {described.label} (unavailable)
            </option>
          ) : null}
          {groupByProvider(models).map((group) => (
            <optgroup key={group.provider} label={group.label} className="bg-raised text-muted-foreground">
              {group.models.map((m) => (
                <option key={m.id} value={m.id} className="bg-raised text-foreground">
                  {m.label}
                  {m.description ? ` — ${m.description}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p id={`${selectId}-hint`} className="text-xs text-subtle">
          Used for new chats and Council sessions. You can switch per conversation. Providers appear here once
          their API key is configured on the server.
        </p>
      </div>
      <Feedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-auto px-5" variant="secondary">
        Save
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
        />
        <Field
          label="Confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
        />
      </div>
      <Feedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Updating…" className="w-auto px-5" variant="secondary">
        Update password
      </SubmitButton>
    </form>
  );
}
