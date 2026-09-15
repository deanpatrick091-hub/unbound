"use client";

import { useActionState, useId } from "react";
import Link from "next/link";

import type { AuthActionState } from "@/app/(auth)/actions";
import { Feedback } from "@/components/auth/feedback";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

type AuthAction = (prev: AuthActionState, formData: FormData) => Promise<AuthActionState>;

interface AuthFormProps {
  mode: "login" | "signup" | "forgot" | "reset";
  action: AuthAction;
  /** Where to send the user after success (hidden field). */
  next?: string;
  /** Error carried over from a redirect (e.g. a failed confirmation link). */
  initialError?: string;
}

const COPY = {
  login: {
    eyebrow: "Welcome back",
    title: "Sign in to UNBOUND",
    subtitle: "Pick up where you left off.",
    submit: "Sign in",
    pending: "Signing in…",
  },
  signup: {
    eyebrow: "Get started",
    title: "Create your account",
    subtitle: "Free while UNBOUND is in preview.",
    submit: "Create account",
    pending: "Creating account…",
  },
  forgot: {
    eyebrow: "Reset",
    title: "Forgot your password?",
    subtitle: "Enter your email and we'll send a reset link.",
    submit: "Send reset link",
    pending: "Sending…",
  },
  reset: {
    eyebrow: "Almost there",
    title: "Choose a new password",
    subtitle: "Use at least 8 characters.",
    submit: "Update password",
    pending: "Updating…",
  },
} as const;

export function AuthForm({ mode, action, next, initialError }: AuthFormProps) {
  const copy = COPY[mode];
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(action, {
    error: initialError,
  });
  const feedbackId = useId();
  const hasFeedback = Boolean(state.error || state.message);
  // After a successful "check your inbox" the form has done its job.
  const done = Boolean(state.message) && (mode === "signup" || mode === "forgot");

  return (
    <div className="w-full max-w-[360px] animate-rise-in">
      <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">{copy.eyebrow}</p>
      <h1 className="mt-3 text-[26px] font-medium tracking-tight text-foreground">{copy.title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{copy.subtitle}</p>

      <form
        action={formAction}
        className="mt-8 space-y-5"
        aria-describedby={hasFeedback ? feedbackId : undefined}
        noValidate={false}
      >
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {mode !== "reset" ? (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            disabled={isPending || done}
            aria-invalid={state.error ? true : undefined}
          />
        ) : null}

        {mode === "login" || mode === "signup" ? (
          <div className="space-y-2">
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              disabled={isPending || done}
              aria-invalid={state.error ? true : undefined}
              hint={mode === "signup" ? "At least 8 characters." : undefined}
            />
            {mode === "login" ? (
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "reset" ? (
          <>
            <Field
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={isPending}
              aria-invalid={state.error ? true : undefined}
            />
            <Field
              label="Confirm new password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={isPending}
              aria-invalid={state.error ? true : undefined}
            />
          </>
        ) : null}

        <Feedback state={state} id={feedbackId} />

        {!done ? (
          <SubmitButton pending={isPending} pendingLabel={copy.pending}>
            {copy.submit}
          </SubmitButton>
        ) : null}
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        )}
      </p>
    </div>
  );
}
