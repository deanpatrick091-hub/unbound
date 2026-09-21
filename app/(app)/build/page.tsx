import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BuilderWorkspace } from "@/components/build/builder-workspace";
import { getSession } from "@/lib/auth/session";
import { getDefaultModelFor } from "@/lib/data/account";

export const metadata: Metadata = { title: "Builder · UNBOUND" };

export default async function BuildPage() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const model = await getDefaultModelFor(supabase, user.id);
  return <BuilderWorkspace model={model} />;
}
