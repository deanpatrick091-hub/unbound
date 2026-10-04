import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CouncilScreen } from "@/components/council/council-screen";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/chat/validation";
import { emptyMembers, type CouncilState } from "@/lib/council/state";
import { getCouncilSession } from "@/lib/data/council";
import { resolveModel } from "@/lib/gemini/models";

export async function generateMetadata({ params }: PageProps<"/council/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Council · UNBOUND" };
  const { user, supabase } = await getSession();
  if (!user) return { title: "Council · UNBOUND" };
  const result = await getCouncilSession(supabase, id).catch(() => null);
  return { title: result ? `${result.session.title} · Council` : "Council · UNBOUND" };
}

export default async function CouncilSessionPage({ params }: PageProps<"/council/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { supabase, user } = await getSession();
  if (!user) throw new Error("Workspace session unavailable.");

  const result = await getCouncilSession(supabase, id);
  if (!result) notFound();
  const { session, opinions } = result;

  const members = emptyMembers(session.status === "running" ? "pending" : "cancelled");
  for (const opinion of opinions) {
    members[opinion.role] = { text: opinion.content,
      model: opinion.model??undefined,
      message:opinion.error_message??undefined, status: opinion.status };
  }

  const initial: CouncilState = {
    sessionId: session.id,
    question: session.question,
    model: session.model,
    phase: "finished",
    status: session.status,
    members,
    error: null,
  };

  return <CouncilScreen key={session.id} model={resolveModel(session.model)} initial={initial} />;
}
