"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Gavel, Square } from "lucide-react";

import { Composer } from "@/components/chat/composer";
import { MemberCard } from "@/components/council/member-card";
import { Markdown } from "@/components/markdown";
import { useShell } from "@/components/shell/shell-context";
import { useCouncil, type CouncilState } from "@/hooks/use-council";
import { COUNCIL_LIMITS, COUNCIL_MEMBERS, PERSPECTIVE_ROLES } from "@/lib/council/types";
import { cn } from "@/lib/utils";

interface CouncilScreenProps {
  model: string;
  /** A stored session to display read-only. */
  initial?: CouncilState;
}

export function CouncilScreen({ model, initial }: CouncilScreenProps) {
  const router = useRouter();
  const { refreshCouncil,models } = useShell();
  const [seatModels,setSeatModels]=useState<Record<string,string>>(()=>Object.fromEntries(PERSPECTIVE_ROLES.map((role,i)=>[role,models[i%Math.max(1,models.length)]?.id??model])));
  const [selectedModel, setSelectedModel] = useState(model);

  const onSessionCreated = useCallback((session: { id: string }) => {
    window.history.replaceState(null, "", `/council/${session.id}`);
  }, []);

  const council = useCouncil({ initial, onSessionCreated, onFinished: refreshCouncil });
  const { state, isRunning } = council;
  const started = state.phase !== "idle";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden h-14 shrink-0 items-center justify-between border-b px-6 lg:flex">
        <h1 className="text-sm font-medium">Council</h1>
        {started ? (
          <button
            type="button"
            onClick={() => {
              council.reset();
              router.push("/council");
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            New question
          </button>
        ) : null}
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          {!started ? (
            <><Intro/><div className="grid gap-3 sm:grid-cols-2">{PERSPECTIVE_ROLES.map(role=><label key={role} className="text-xs">{COUNCIL_MEMBERS[role].label}<select className="platform-input mt-2 w-full" value={seatModels[role]} onChange={e=>setSeatModels(v=>({...v,[role]:e.target.value}))}>{models.map(m=><option key={m.id} value={m.id}>{m.provider} · {m.label}</option>)}</select></label>)}</div><p className="mt-3 text-xs text-subtle">Choose the judge model in the question bar below.</p></>
          ) : (
            <div className="space-y-6">
              <section aria-label="Question" className="animate-rise-in">
                <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-subtle">Question</p>
                <p className="mt-2 text-lg leading-relaxed text-foreground sm:text-xl">{state.question}</p>
              </section>

              <section aria-label="Perspectives" className="divide-y">
                {PERSPECTIVE_ROLES.map((role, i) => (
                  <MemberCard
                    key={role}
                    role={role}
                    member={state.members[role]}
                    style={{ animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </section>

              <section
                aria-label="Final Judge"
                className={cn(
                  "border-t py-6 transition-colors",
                  state.members.judge.status === "streaming" || state.members.judge.status === "complete"
                    ? "border-brand/30 bg-[linear-gradient(180deg,oklch(0.82_0.09_75_/_0.06),transparent_60%)]"
                    : "border-border bg-surface/60",
                )}
              >
                <header className="flex items-center gap-2.5">
                  <Gavel aria-hidden="true" className="size-4 text-brand" />
                  <h2 className="text-sm font-semibold tracking-wide">{COUNCIL_MEMBERS.judge.label}</h2>
                  <span className="text-xs text-subtle">{state.members.judge.model}</span><StatusPill member={state.members.judge} phase={state.phase} />
                </header>
                <div className="mt-4">
                  {state.members.judge.text ? (
                    <Markdown content={state.members.judge.text} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {state.phase === "perspectives"
                        ? "Waiting for all perspectives before deliberating…"
                        : state.members.judge.status === "error"
                          ? state.members.judge.message ?? "The Judge could not respond."
                          : state.members.judge.status === "cancelled"
                            ? "Cancelled before the Judge ruled."
                            : "Deliberating…"}
                    </p>
                  )}
                </div>
              </section>

              {state.error ? (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <p>{state.error.message}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {isRunning ? (
        <div className="mx-auto w-full max-w-5xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={council.stop}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border bg-surface text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            <Square className="size-3.5 fill-current" aria-hidden="true" />
            Stop the Council
          </button>
        </div>
      ) : !started || initial ? (
        <Composer
          isBusy={isRunning}
          model={selectedModel}
          onModelChange={setSelectedModel}
          onSend={(q) => void council.submit(q, selectedModel,seatModels)}
          onStop={council.stop}
          placeholder={initial ? "Ask the Council a new question…" : "Bring a decision to the Council…"}
          maxLength={COUNCIL_LIMITS.maxQuestionLength}
          hint="Four perspectives, one verdict · costs 5 requests"
          autoFocus={!initial}
        />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={() => {
              council.reset();
              router.push("/council");
            }}
            className="flex h-10 w-full items-center justify-center rounded-xl border bg-surface text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ member, phase }: { member: CouncilState["members"]["judge"]; phase: CouncilState["phase"] }) {
  const label =
    member.status === "complete"
      ? "Verdict"
      : member.status === "streaming"
        ? "Deliberating"
        : member.status === "error"
          ? "Failed"
          : member.status === "cancelled"
            ? "Cancelled"
            : phase === "perspectives"
              ? "Waiting"
              : "Pending";
  return (
    <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </span>
  );
}

function Intro() {
  return <div className="py-5"><h2 className="text-lg font-medium">A question. Several perspectives.</h2><p className="mt-2 text-sm text-muted-foreground">Choose your council, then ask below.</p></div>;
}
