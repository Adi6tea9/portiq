"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/Callout";
import { Field } from "@/components/shared/Field";
import { PageState } from "@/components/shared/PageState";
import { ApiError } from "@/lib/api/client";
import { usePorts } from "@/lib/api/hooks/usePorts";
import { portWallTimeToUtc } from "@/lib/port-time";
import { createShipment } from "@/lib/shipments/api";
import { mapShipmentValidationDetails } from "@/lib/shipments/errors";
import {
  CARGO_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  DIRECTION_OPTIONS,
  DOCUMENTATION_STATUS_OPTIONS,
  SHIPPING_LINE_OPTIONS,
  VESSEL_SIZE_BAND_OPTIONS,
  containerSizeOptionLabel,
  humanizeOption,
} from "@/lib/shipments/options";
import {
  SHIPMENT_FORM_FIELDS,
  shipmentFormSchema,
  toShipmentCreate,
  type ShipmentFormValues,
} from "@/lib/shipments/schema";
import { SelectControl, type SelectOption } from "./SelectControl";

const DIRECTION_SELECT_OPTIONS: SelectOption[] = DIRECTION_OPTIONS.map(
  (value) => ({ value, label: humanizeOption(value) }),
);
const CARGO_TYPE_SELECT_OPTIONS: SelectOption[] = CARGO_TYPE_OPTIONS.map(
  (value) => ({ value, label: humanizeOption(value) }),
);
const CONTAINER_SIZE_SELECT_OPTIONS: SelectOption[] =
  CONTAINER_SIZE_OPTIONS.map((value) => ({
    value,
    label: containerSizeOptionLabel(value),
  }));
const SHIPPING_LINE_SELECT_OPTIONS: SelectOption[] = SHIPPING_LINE_OPTIONS.map(
  (value) => ({ value, label: humanizeOption(value) }),
);
const VESSEL_SIZE_BAND_SELECT_OPTIONS: SelectOption[] =
  VESSEL_SIZE_BAND_OPTIONS.map((value) => ({
    value,
    label: humanizeOption(value),
  }));
const DOCUMENTATION_STATUS_SELECT_OPTIONS: SelectOption[] =
  DOCUMENTATION_STATUS_OPTIONS.map((value) => ({
    value,
    label: humanizeOption(value),
  }));

interface NewShipmentFormProps {
  mockError?: string;
}

export function NewShipmentForm({ mockError }: NewShipmentFormProps) {
  const router = useRouter();
  const portsQuery = usePorts();
  const [apiError, setApiError] = React.useState<{
    message: string;
    requestId: string;
  } | null>(null);
  const submittingRef = React.useRef(false);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentFormSchema),
    defaultValues: { currency: "INR" },
  });

  const ports = portsQuery.data ?? [];
  const selectedPort = ports.find((port) => port.id === watch("port_id"));
  const portOptions: SelectOption[] = ports.map((port) => ({
    value: port.id,
    label: `${port.port_code} — ${port.name}`,
  }));
  const portHint = selectedPort
    ? `Port timezone: ${selectedPort.timezone}`
    : "Select a port to see its timezone.";
  const arrivalHint = selectedPort
    ? `Entered in ${selectedPort.timezone}; sent to the API as UTC.`
    : "Entered in the port timezone; sent to the API as UTC.";

  const onSubmit = handleSubmit(async (values) => {
    if (submittingRef.current) {
      return;
    }

    const port = ports.find((item) => item.id === values.port_id);

    if (!port) {
      setError("port_id", { type: "server", message: "Select a port." });
      return;
    }

    submittingRef.current = true;
    clearErrors();
    setApiError(null);

    try {
      const expectedArrivalAt = portWallTimeToUtc(
        values.expected_arrival_at,
        port.timezone,
      );
      const shipment = await createShipment(
        toShipmentCreate(values, expectedArrivalAt),
        mockError,
      );

      router.push(`/shipments/${shipment.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = mapShipmentValidationDetails(error.details);

        for (const field of SHIPMENT_FORM_FIELDS) {
          const message = fieldErrors[field];

          if (message) {
            setError(field, { type: "server", message });
          }
        }

        setApiError({ message: error.message, requestId: error.requestId });
      } else {
        setApiError({
          message: "Something went wrong. Please try again.",
          requestId: "unknown",
        });
      }
    } finally {
      submittingRef.current = false;
    }
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-harbor-navy">New shipment</h1>

      {portsQuery.isLoading ? <PageState state="loading" /> : null}

      {portsQuery.isError ? (
        portsQuery.error.status === 403 ? (
          <PageState state="permission" />
        ) : (
          <PageState
            state="error"
            title="Unable to load ports"
            message={portsQuery.error.message}
            requestId={portsQuery.error.requestId}
            onRetry={() => void portsQuery.refetch()}
          />
        )
      ) : null}

      {portsQuery.isSuccess ? (
        <Card>
          <CardContent className="p-6">
            <form
              onSubmit={onSubmit}
              noValidate
              aria-busy={isSubmitting}
              className="space-y-6"
            >
              {apiError ? (
                <Callout variant="danger">
                  <p>{apiError.message}</p>
                  {apiError.requestId ? (
                    <p className="mt-1 font-mono text-xs text-muted">
                      Request ID: {apiError.requestId}
                    </p>
                  ) : null}
                </Callout>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="port_id"
                  label="Port"
                  hint={portHint}
                  error={errors.port_id?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a port."
                    options={portOptions}
                    {...register("port_id")}
                  />
                </Field>

                <Field
                  id="reference"
                  label="Reference"
                  error={errors.reference?.message}
                  required
                >
                  <Input autoComplete="off" {...register("reference")} />
                </Field>

                <Field
                  id="direction"
                  label="Direction"
                  error={errors.direction?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a direction."
                    options={DIRECTION_SELECT_OPTIONS}
                    {...register("direction")}
                  />
                </Field>

                <Field
                  id="cargo_type"
                  label="Cargo type"
                  error={errors.cargo_type?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a cargo type."
                    options={CARGO_TYPE_SELECT_OPTIONS}
                    {...register("cargo_type")}
                  />
                </Field>

                <Field
                  id="container_size_ft"
                  label="Container size"
                  error={errors.container_size_ft?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a container size."
                    options={CONTAINER_SIZE_SELECT_OPTIONS}
                    {...register("container_size_ft")}
                  />
                </Field>

                <Field
                  id="hs_code"
                  label="HS code"
                  hint="6 digits."
                  error={errors.hs_code?.message}
                  required
                >
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="off"
                    {...register("hs_code")}
                  />
                </Field>

                <Field
                  id="weight_kg"
                  label="Weight"
                  hint="kg"
                  error={errors.weight_kg?.message}
                  required
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    {...register("weight_kg")}
                  />
                </Field>

                <Field
                  id="declared_value"
                  label="Declared value"
                  hint="INR, two decimal places."
                  error={errors.declared_value?.message}
                  required
                >
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    {...register("declared_value")}
                  />
                </Field>

                <Field id="currency" label="Currency">
                  <Input value="INR" readOnly aria-readonly="true" />
                </Field>

                <Field
                  id="shipping_line"
                  label="Shipping line"
                  error={errors.shipping_line?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a shipping line."
                    options={SHIPPING_LINE_SELECT_OPTIONS}
                    {...register("shipping_line")}
                  />
                </Field>

                <Field
                  id="vessel_size_band"
                  label="Vessel size band"
                  error={errors.vessel_size_band?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a vessel size band."
                    options={VESSEL_SIZE_BAND_SELECT_OPTIONS}
                    {...register("vessel_size_band")}
                  />
                </Field>

                <Field
                  id="expected_arrival_at"
                  label="Expected arrival"
                  hint={arrivalHint}
                  error={errors.expected_arrival_at?.message}
                  required
                >
                  <Input
                    type="datetime-local"
                    {...register("expected_arrival_at")}
                  />
                </Field>

                <Field
                  id="documentation_status"
                  label="Documentation status"
                  error={errors.documentation_status?.message}
                  required
                >
                  <SelectControl
                    placeholder="Select a documentation status."
                    options={DOCUMENTATION_STATUS_SELECT_OPTIONS}
                    {...register("documentation_status")}
                  />
                </Field>
              </div>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create shipment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
