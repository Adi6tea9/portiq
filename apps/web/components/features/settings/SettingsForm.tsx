"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { PageState } from "@/components/shared/PageState";
import { useMe } from "@/components/providers/MeProvider";
import { ApiError } from "@/lib/api/client";
import { updateDisplayName } from "@/lib/api/me";
import { DISPLAY_NAME_MAX_LENGTH, type Me } from "@/lib/api/types";
import { ROLE_LABELS } from "@/lib/navigation";

const DISPLAY_NAME_REQUIRED = "Enter a display name.";

export function SettingsForm() {
  const { me, isLoading, error, refetch } = useMe();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const savedName = me?.display_name ?? "";

  React.useEffect(() => {
    setDisplayName(savedName);
  }, [savedName]);

  const mutation = useMutation<Me, ApiError, string>({
    mutationFn: updateDisplayName,
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      setNotice("Display name updated.");
    },
  });

  if (isLoading) {
    return <PageState state="loading" />;
  }

  if (error || !me) {
    return (
      <PageState
        state="error"
        title="Unable to load your profile"
        message={error?.message ?? "The profile could not be loaded."}
        requestId={error?.requestId}
        onRetry={refetch}
      />
    );
  }

  const trimmed = displayName.trim();
  const unchanged = trimmed === savedName;
  const saving = mutation.isPending;
  const details = mutation.error?.details?.find(
    (detail) => detail.field === "display_name",
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setNotice(null);
    setFieldError(null);
    mutation.reset();

    if (trimmed === "") {
      setFieldError(DISPLAY_NAME_REQUIRED);
      return;
    }

    mutation.mutate(trimmed);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate className="space-y-6" onSubmit={onSubmit}>
          <Field
            id="settings-display-name"
            label="Display name"
            required
            hint={`Shown on shipments and events you record. Up to ${DISPLAY_NAME_MAX_LENGTH} characters.`}
            error={fieldError ?? details?.issue}
          >
            <Input
              name="display_name"
              autoComplete="name"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium text-text" id="settings-role-label">
              Role
            </p>
            <p
              aria-labelledby="settings-role-label"
              className="rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text"
            >
              {ROLE_LABELS[me.role]}
            </p>
            <p className="text-xs text-muted">
              Your role is assigned by the platform and cannot be changed here.
            </p>
          </div>

          <p className="text-sm text-muted">
            Signed in as <span className="font-mono text-xs">{me.email}</span>
          </p>

          {mutation.isError && !details ? (
            <Callout variant="danger">
              <p>{mutation.error.message}</p>
              {mutation.error.requestId ? (
                <p className="mt-1 font-mono text-xs">
                  Request ID: {mutation.error.requestId}
                </p>
              ) : null}
            </Callout>
          ) : null}

          {notice ? <Callout variant="info">{notice}</Callout> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || unchanged}>
              {saving ? "Saving…" : "Save display name"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
