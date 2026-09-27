import Link from "next/link";
import { ArrowUpRight, Layers3, MessageSquare, WandSparkles } from "lucide-react";
import { ThemeToggle } from "@/components/appearance/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="auth-stage flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10 lg:px-14">
        <Link href="/" aria-label="Unbound home"><Wordmark /></Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-center gap-12 px-6 py-8 sm:px-10 lg:grid-cols-[1.2fr_1fr] lg:gap-20 lg:px-14 lg:py-16">
        <section className="hidden lg:block">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/30 px-4 py-2 text-xs tracking-[0.14em] text-muted-foreground">
            <WandSparkles size={14} className="text-brand" /> YOUR NEXT IDEA STARTS HERE
          </div>
          <h1 className="auth-title">A little space.<br />A lot of<br /><em>possibility.</em></h1>
          <p className="mt-8 max-w-sm text-base leading-relaxed text-muted-foreground">Think it through. Make something new. Bring your favourite AI models into one personal workspace.</p>
          <div className="mt-12 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="glass-panel flex items-center gap-2 rounded-full px-4 py-2.5"><MessageSquare size={16} /> Chat</span>
            <span className="glass-panel flex items-center gap-2 rounded-full px-4 py-2.5"><Layers3 size={16} /> Compare ideas</span>
            <span className="glass-panel flex items-center gap-2 rounded-full px-4 py-2.5"><ArrowUpRight size={16} /> Build</span>
          </div>
        </section>
        <section aria-label="Your account" className="auth-card glass-panel mx-auto flex w-full max-w-[480px] justify-center">{children}</section>
      </main>
      <footer className="flex flex-wrap justify-between gap-3 px-6 py-6 text-xs text-subtle sm:px-10 lg:px-14">
        <span>© {new Date().getFullYear()} Unbound AI</span><span>Your ideas. Your space.</span>
      </footer>
    </div>
  );
}
