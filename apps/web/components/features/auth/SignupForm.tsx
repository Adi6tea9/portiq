"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { apiClient } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { signUpWithPassword } from "@/lib/auth/actions";
import { safeReturnTo } from "@/lib/auth/return-path";
import { defaultPathForRole } from "@/lib/auth/route-access";
import { signupSchema, type SignupValues } from "@/lib/auth/validation";

interface SignupFormProps {
  returnTo: string | null;
}

export function SignupForm({ returnTo }: SignupFormProps) {
  const router = useRouter();
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
  });

  const safe = safeReturnTo(returnTo);
  const loginHref = safe
    ? `/login?returnTo=${encodeURIComponent(safe)}`
    : "/login";

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    setConfirmation(null);
    const result = await signUpWithPassword(values.email, values.password);

    if (result.error) {
      setAuthError(result.error);
      return;
    }

    if (result.needsEmailConfirmation) {
      setConfirmation(
        "Check your email to confirm your account, then sign in.",
      );
      return;
    }

    try {
      const response = await apiClient<Me>("/me");
      router.replace(safe ?? defaultPathForRole(response.data.role));
      router.refresh();
    } catch {
      setAuthError("Unable to load your account. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {authError ? <Callout variant="danger">{authError}</Callout> : null}
      {confirmation ? <Callout variant="info">{confirmation}</Callout> : null}

      <Field id="email" label="Email" error={errors.email?.message} required>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register("email")}
        />
      </Field>

      <Field
        id="password"
        label="Password"
        hint="At least 8 characters."
        error={errors.password?.message}
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
