import type { Metadata } from "next";

import { signup } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account · UNBOUND" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
