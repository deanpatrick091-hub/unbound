import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CouncilScreen } from "@/components/council/council-screen";
import { getSession } from "@/lib/auth/session";
import { getDefaultModelFor } from "@/lib/data/account";

export const metadata: Metadata = { title: "Council · UNBOUND" };

export default async function CouncilPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const model = await getDefaultModelFor(supabase, user.id);
  return <CouncilScreen key="new" model={model} />;
}
