import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13px] font-semibold tracking-[0.28em] text-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" />
      UNBOUND
    </span>
  );
}
