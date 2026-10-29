import type { Metadata } from "next";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { SignupForm } from "@/components/features/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create account · PortIQ",
};

interface SignupPageProps {
  searchParams?: {
    returnTo?: string | string[];
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function SignupPage({ searchParams }: SignupPageProps) {
  const returnTo = first(searchParams?.returnTo) ?? null;

  return (
    <AuthCard
      title="Create account"
      description="Public accounts are created for importers and exporters."
    >
      <SignupForm returnTo={returnTo} />
    </AuthCard>
  );
}
