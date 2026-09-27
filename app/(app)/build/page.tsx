import type { Metadata } from "next";

import { BuilderWorkspace } from "@/components/build/builder-workspace";
import { getSession } from "@/lib/auth/session";
import { getDefaultModelFor } from "@/lib/data/account";

export const metadata: Metadata = { title: "Builder · UNBOUND" };

export default async function BuildPage() {
  const { supabase, user } = await getSession();
  if (!user) throw new Error("Workspace session unavailable.");

  const model = await getDefaultModelFor(supabase, user.id);
  return <BuilderWorkspace model={model} />;
}
