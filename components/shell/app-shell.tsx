"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { PanelLeft, Plus, X } from "lucide-react";

import { Sidebar } from "@/components/shell/sidebar";
import { useShell } from "@/components/shell/shell-context";
import { AppearanceButton, AppearanceProvider, WallpaperLayer } from "@/components/appearance/appearance";
import { ThemeToggle } from "@/components/appearance/theme-toggle";

/**
 * Two-column desktop layout with a fixed sidebar; on mobile the sidebar
 * becomes an accessible drawer (focus-trapped, Esc to close) behind a compact
 * top bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, mobileNavOpen, setMobileNavOpen } = useShell();

  // Close the drawer after any navigation.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  return (
    <AppearanceProvider userId={user.id}>
    <div className="workspace-shell flex h-dvh">
      <aside className="workspace-sidebar glass-panel hidden w-[256px] shrink-0 lg:block">
        <Sidebar />
      </aside>

      <div className="workspace-main glass-panel flex min-w-0 flex-1 flex-col">
        <WallpaperLayer />
        <header className="workspace-toolbar flex h-16 shrink-0 items-center justify-between border-b px-3 sm:px-5">
          <div className="flex items-center gap-3">
          <div className="lg:hidden">
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
                className="glass-dialog fixed inset-y-3 left-3 z-50 w-[min(86vw,320px)] rounded-3xl p-2 outline-none animate-rise-in"
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
          </div>
          <span className="text-sm font-medium">{pathname.startsWith("/build") ? "Website studio" : pathname.startsWith("/council") ? "Council" : pathname === "/settings" ? "Your settings" : pathname === "/models" ? "Model library" : pathname === "/image-gen" ? "Image studio" : "Your workspace"}</span>
          </div>
          <div className="flex items-center gap-2">
          <AppearanceButton />
          <ThemeToggle />
          <Link
            href="/"
            aria-label="New chat"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-5" />
          </Link>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
    </AppearanceProvider>
  );
}
