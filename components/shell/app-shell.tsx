"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { PanelLeft, Plus, X } from "lucide-react";

import { Sidebar } from "@/components/shell/sidebar";
import { useShell } from "@/components/shell/shell-context";
import { Wordmark } from "@/components/shell/wordmark";

/**
 * Two-column desktop layout with a fixed sidebar; on mobile the sidebar
 * becomes an accessible drawer (focus-trapped, Esc to close) behind a compact
 * top bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useShell();

  // Close the drawer after any navigation.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  return (
    <div className="flex h-dvh bg-background">
      <aside className="hidden w-[272px] shrink-0 border-r bg-surface/60 lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-2 lg:hidden">
          <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PanelLeft className="size-5" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 animate-fade-in" />
              <Dialog.Content
                aria-describedby={undefined}
                className="fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] border-r bg-surface shadow-[8px_0_40px_-12px_rgba(0,0,0,0.7)] outline-none animate-rise-in"
              >
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close navigation"
                    className="absolute top-2.5 right-2 z-10 flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-4" />
                  </button>
                </Dialog.Close>
                <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <Wordmark />

          <Link
            href="/"
            aria-label="New chat"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-5" />
          </Link>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
