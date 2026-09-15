"use client";

import { useActionState, useId } from "react";

import { updatePassword, updatePreferences, updateProfile, type AuthActionState } from "@/app/(auth)/actions";
import { Feedback } from "@/components/auth/feedback";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { MODEL_OPTIONS } from "@/lib/gemini/models";
import { cn } from "@/lib/utils";

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

export function PreferencesForm({ defaultModel }: { defaultModel: string }) {
  const [state, action, pending] = useActionState(updatePreferences, EMPTY);
  const groupId = useId();
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2" aria-describedby={`${groupId}-hint`}>
        <legend className="text-[13px] text-muted-foreground">Default model</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODEL_OPTIONS.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border bg-background/40 px-3.5 py-3 transition-colors",
                "has-[:checked]:border-border-strong has-[:checked]:bg-raised hover:border-border-strong",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="default_model"
                  value={m.id}
                  defaultChecked={m.id === defaultModel}
                  disabled={pending}
                  className="size-3.5 accent-[var(--brand)]"
                />
                <span className="text-sm font-medium">{m.label}</span>
              </span>
              <span className="text-xs text-muted-foreground">{m.description}</span>
            </label>
          ))}
        </div>
        <p id={`${groupId}-hint`} className="text-xs text-subtle">
          Used for new chats and Council sessions. You can switch per conversation.
        </p>
      </fieldset>
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
