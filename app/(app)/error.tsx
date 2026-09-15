"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div role="alert" className="max-w-sm text-center animate-rise-in">
        <AlertCircle aria-hidden="true" className="mx-auto size-6 text-destructive" />
        <h1 className="mt-4 text-xl font-medium tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen failed to load. Your data is safe — try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
