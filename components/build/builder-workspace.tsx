"use client";

import dynamic from "next/dynamic";

/**
 * Loads the builder client-only. The workspace restores its state from
 * localStorage synchronously on first render, which is only possible in the
 * browser — so it is never server-rendered.
 */
const BuilderScreen = dynamic(() => import("@/components/build/builder-screen").then((m) => m.BuilderScreen), {
  ssr: false,
  loading: () => <BuilderSkeleton />,
});

export function BuilderWorkspace({ model }: { model: string }) {
  return <BuilderScreen model={model} />;
}

function BuilderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1" aria-busy="true" aria-label="Loading builder">
      <div className="hidden min-h-0 flex-col border-r lg:flex lg:w-[45%]">
        <div className="h-12 border-b" />
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-3xl px-3 pb-4 sm:px-6">
          <div className="h-[92px] rounded-xl border bg-surface" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="h-12 border-b" />
        <div className="flex-1 bg-[oklch(0.1_0.004_285)]" />
      </div>
    </div>
  );
}
