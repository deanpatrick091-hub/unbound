import type { Metadata } from "next";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Reset password · UNBOUND" };

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" action={requestPasswordReset} />;
}
