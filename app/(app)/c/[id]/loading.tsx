export default function ConversationLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="hidden h-14 shrink-0 items-center border-b px-6 lg:flex">
        <div className="h-3.5 w-40 rounded bg-raised animate-pulse-soft" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 px-4 pt-8 sm:px-6">
        <div className="ml-auto h-10 w-2/5 rounded-2xl bg-raised animate-pulse-soft" />
        <div className="space-y-2.5">
          <div className="h-3.5 w-11/12 rounded bg-raised animate-pulse-soft" />
          <div className="h-3.5 w-4/5 rounded bg-raised animate-pulse-soft" />
          <div className="h-3.5 w-2/3 rounded bg-raised animate-pulse-soft" />
        </div>
        <div className="ml-auto h-10 w-1/3 rounded-2xl bg-raised animate-pulse-soft" />
      </div>
      <div className="mx-auto w-full max-w-3xl px-3 pb-6 sm:px-6">
        <div className="h-[92px] rounded-xl border bg-surface" />
      </div>
    </div>
  );
}
