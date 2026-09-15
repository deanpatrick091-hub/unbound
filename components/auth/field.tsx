import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends Omit<React.ComponentProps<"input">, "id"> {
  label: string;
  hint?: string;
}

/** Label + input + optional hint, wired for accessibility. */
export function Field({ label, hint, className, ...props }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className={
          "h-10 border-border bg-background/40 text-[15px] shadow-none placeholder:text-subtle focus-visible:border-border-strong focus-visible:ring-ring/50 md:text-sm " +
          (className ?? "")
        }
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
