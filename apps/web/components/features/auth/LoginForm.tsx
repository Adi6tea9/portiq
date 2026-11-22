"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { apiClient } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { signInWithPassword, signOut } from "@/lib/auth/actions";
import { accountTypeMismatch, type AccountType } from "@/lib/auth/account-type";
import { AccountTypeToggle } from "./AccountTypeToggle";
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
  const [showPassword, setShowPassword] = React.useState(false);
  const [accountType, setAccountType] = React.useState<AccountType>("importer");
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

    let me: Me;
    try {
      me = (await apiClient<Me>("/me")).data;
    } catch {
      setAuthError("Unable to load your account. Please try again.");
      return;
    }

    // The toggle only confirms the account type; the role always comes from /me.
    const mismatch = accountTypeMismatch(accountType, me.role);
    if (mismatch) {
      await signOut();
      setAuthError(mismatch);
      return;
    }

    router.replace(safe ?? defaultPathForRole(me.role));
    router.refresh();
  });

  const message = authError ?? notice;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {message ? (
        <Callout variant={authError ? "danger" : noticeVariant}>
          {message}
        </Callout>
      ) : null}

      <AccountTypeToggle value={accountType} onChange={setAccountType} />

      <Field id="email" label="Email" error={errors.email?.message} required>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="app-input-mail"
          {...register("email")}
        />
      </Field>

      <div className="relative">
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          required
        >
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="app-input-lock pr-11"
            {...register("password")}
          />
        </Field>
        {/* Sits over the input's right edge; label row above is a fixed height. */}
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          aria-controls="password"
          className="absolute right-1 top-[1.75rem] flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-text"
        >
          {showPassword ? (
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Eye aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="flex items-center justify-end gap-4">
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
