import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmitButtonProps extends React.ComponentProps<typeof Button> {
  pending: boolean;
  pendingLabel: string;
  children: React.ReactNode;
}

export function SubmitButton({ pending, pendingLabel, children, className, ...props }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn("h-10 w-full text-[14px] font-medium tracking-wide", className)}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
