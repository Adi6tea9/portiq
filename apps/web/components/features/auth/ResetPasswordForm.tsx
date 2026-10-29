"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { signOut, updatePassword } from "@/lib/auth/actions";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/lib/auth/validation";

export function ResetPasswordForm() {
  const router = useRouter();
  const [authError, setAuthError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    const result = await updatePassword(values.password);

    if (result.error) {
      setAuthError(result.error);
      return;
    }

    await signOut();
    router.replace("/login?reset=1");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {authError ? <Callout variant="danger">{authError}</Callout> : null}

      <Field
        id="password"
        label="New password"
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
        {isSubmitting ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
