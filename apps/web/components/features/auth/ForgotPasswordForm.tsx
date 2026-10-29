"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { requestPasswordReset } from "@/lib/auth/actions";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/auth/validation";

export function ForgotPasswordForm() {
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    const result = await requestPasswordReset(values.email);

    if (result.error) {
      setAuthError(result.error);
      return;
    }

    setSent(true);
  });

  if (sent) {
    return (
      <div className="space-y-5">
        <Callout variant="info">
          If an account exists for that email, a recovery link has been sent.
        </Callout>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {authError ? <Callout variant="danger">{authError}</Callout> : null}

      <Field id="email" label="Email" error={errors.email?.message} required>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register("email")}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send recovery link"}
      </Button>

      <p className="text-sm text-muted">
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
