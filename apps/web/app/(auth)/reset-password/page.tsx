import type { Metadata } from "next";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { ResetPasswordForm } from "@/components/features/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password · PortIQ",
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="Enter a new password for your account."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
