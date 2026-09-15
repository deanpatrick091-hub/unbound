import type { Metadata } from "next";

import { login } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in · UNBOUND" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));
  const error = first(params.error);

  return (
    <AuthForm
      mode="login"
      action={login}
      next={next === "/" ? undefined : next}
      initialError={error}
    />
  );
}
