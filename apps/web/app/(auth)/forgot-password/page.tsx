import type { Metadata } from "next";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/features/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset password · PortIQ",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we will send a recovery link."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
