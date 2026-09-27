import { cn } from "@/lib/utils";
import { Orbit } from "lucide-react";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 text-[15px] font-semibold tracking-[0.18em] text-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className="brand-mark"><Orbit size={23} strokeWidth={1.3} /></span>
      UNBOUND
    </span>
  );
}
