import type { Metadata } from "next";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { LoginForm } from "@/components/features/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · PortIQ",
};

interface LoginPageProps {
  searchParams?: {
    returnTo?: string | string[];
    reset?: string | string[];
    authError?: string | string[];
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const returnTo = first(searchParams?.returnTo) ?? null;
  const reset = first(searchParams?.reset);
  const authError = first(searchParams?.authError);

  const notice = reset
    ? "Password updated. Sign in with your new password."
    : authError
      ? "That sign-in link is invalid or has expired. Request a new link."
      : undefined;

  return (
    <AuthCard
      title="Sign in"
      description="Sign in to plan shipments and review forecasts."
    >
      <LoginForm
        returnTo={returnTo}
        notice={notice}
        noticeVariant={authError ? "danger" : "info"}
      />
    </AuthCard>
  );
}
