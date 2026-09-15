"use client";

import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  iconOnly?: boolean;
  className?: string;
}

export function SignOutButton({ iconOnly = false, className }: SignOutButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon-sm" : "sm"}
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
      aria-label="Sign out"
      title="Sign out"
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      {isPending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <LogOut aria-hidden="true" />
      )}
      {iconOnly ? null : "Sign out"}
    </Button>
  );
}
