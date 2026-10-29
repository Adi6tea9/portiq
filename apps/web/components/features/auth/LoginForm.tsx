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
import { signInWithPassword } from "@/lib/auth/actions";
import { safeReturnTo } from "@/lib/auth/return-path";
import { defaultPathForRole } from "@/lib/auth/route-access";
import { loginSchema, type LoginValues } from "@/lib/auth/validation";

interface LoginFormProps {
  returnTo: string | null;
  notice?: string;
  noticeVariant?: "info" | "danger";
}

export function LoginForm({
  returnTo,
  notice,
  noticeVariant = "info",
}: LoginFormProps) {
  const router = useRouter();
  const [authError, setAuthError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const safe = safeReturnTo(returnTo);
  const signupHref = safe
    ? `/signup?returnTo=${encodeURIComponent(safe)}`
    : "/signup";

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    const result = await signInWithPassword(values.email, values.password);

    if (result.error) {
      setAuthError(result.error);
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

  const message = authError ?? notice;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {message ? (
        <Callout variant={authError ? "danger" : noticeVariant}>
          {message}
        </Callout>
      ) : null}

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
        error={errors.password?.message}
        required
      >
        <Input
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
      </Field>

      <div className="flex items-center justify-between gap-4">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-sm text-muted">
        New to PortIQ?{" "}
        <Link
          href={signupHref}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
