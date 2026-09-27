import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { ActionState } from "@/app/(app)/settings/actions";

interface FeedbackProps {
  state: ActionState;
  id?: string;
}

/** Inline error / success line for action-driven forms. */
export function Feedback({ state, id }: FeedbackProps) {
  if (state.error) {
    return (
      <p
        id={id}
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-sm text-destructive animate-rise-in"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{state.error}</span>
      </p>
    );
  }
  if (state.message) {
    return (
      <p
        id={id}
        role="status"
        className="flex items-start gap-2 rounded-md border border-brand/25 bg-brand/[0.06] px-3 py-2 text-sm text-foreground animate-rise-in"
      >
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>{state.message}</span>
      </p>
    );
  }
  return null;
}
