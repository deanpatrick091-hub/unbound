import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { updatePassword } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New password · UNBOUND" };

/**
 * Reached from the email reset link via /auth/confirm, which establishes a
 * session first. Without one there is nothing to update, so bounce to /login.
 */
export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?error=Your+reset+link+has+expired.+Request+a+new+one.");

  return <AuthForm mode="reset" action={updatePassword} next="/" />;
}
