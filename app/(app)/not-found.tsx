import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-sm text-center animate-rise-in">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">Not found</p>
        <h1 className="mt-3 text-xl font-medium tracking-tight">That page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or the link is wrong.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-md border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-raised"
        >
          Start a new chat
        </Link>
      </div>
    </div>
  );
}
