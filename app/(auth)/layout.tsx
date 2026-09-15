import Link from "next/link";

import { Wordmark } from "@/components/shell/wordmark";

/**
 * Split-panel auth layout: a quiet brand panel on wide screens, the form on
 * the right. Collapses to a single column with a slim brand header on mobile.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10">
        {/* Soft vignette — depth without a gradient wash. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,oklch(1_0_0_/_0.05),transparent_55%)]"
        />
        <Link href="/" className="relative w-fit">
          <Wordmark />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[32px] leading-[1.15] font-medium tracking-tight text-foreground">
            Think out loud with something that thinks back.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Fast answers when you need them. A five-seat Council when the decision matters.
          </p>
        </div>
        <p className="relative text-[11px] tracking-wide text-subtle">© {new Date().getFullYear()} UNBOUND</p>
      </aside>

      <main className="flex flex-col">
        <header className="flex h-14 items-center px-6 lg:hidden">
          <Link href="/">
            <Wordmark />
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">{children}</div>
      </main>
    </div>
  );
}
