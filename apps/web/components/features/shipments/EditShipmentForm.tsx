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
import { ApiError } from "@/lib/api/client";
import type { ShipmentDetail, ShipmentPatch } from "@/lib/api/types";
import { portWallTimeToUtc, utcToPortWallTime } from "@/lib/port-time";
import { updateShipment } from "@/lib/shipments/api";
import { mapShipmentValidationDetails } from "@/lib/shipments/errors";
import {
  CARGO_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  DOCUMENTATION_STATUS_OPTIONS,
  SHIPPING_LINE_OPTIONS,
  VESSEL_SIZE_BAND_OPTIONS,
  containerSizeOptionLabel,
  humanizeOption,
} from "@/lib/shipments/options";
import {
  shipmentEditSchema,
  type ShipmentEditValues,
} from "@/lib/shipments/schema";
import { SelectControl, type SelectOption } from "./SelectControl";

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

interface EditShipmentFormProps {
  shipment: ShipmentDetail;
  portTimezone: string;
  mockError?: string;
}

export function EditShipmentForm({
  shipment,
  portTimezone,
  mockError,
}: EditShipmentFormProps) {
  const router = useRouter();
  const [apiError, setApiError] = React.useState<{
    message: string;
    requestId: string;
  } | null>(null);
  const submittingRef = React.useRef(false);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ShipmentEditValues>({
    resolver: zodResolver(shipmentEditSchema),
    defaultValues: {
      cargo_type: shipment.cargo_type,
      container_size_ft: String(
        shipment.container_size_ft,
      ) as ShipmentEditValues["container_size_ft"],
      hs_code: shipment.hs_code,
      weight_kg: String(shipment.weight_kg),
      declared_value: shipment.declared_value,
      shipping_line: shipment.shipping_line,
      vessel_size_band: shipment.vessel_size_band,
      expected_arrival_at: utcToPortWallTime(
        shipment.expected_arrival_at,
        portTimezone,
      ),
      documentation_status: shipment.documentation_status,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    clearErrors();
    setApiError(null);

    try {
      const patch: ShipmentPatch = {};
      const weight = Number(values.weight_kg);

      if (values.cargo_type !== shipment.cargo_type) {
        patch.cargo_type = values.cargo_type as ShipmentPatch["cargo_type"];
      }
      if (values.container_size_ft !== String(shipment.container_size_ft)) {
        patch.container_size_ft = values.container_size_ft === "20" ? 20 : 40;
      }
      if (values.hs_code.trim() !== shipment.hs_code) {
        patch.hs_code = values.hs_code.trim();
      }
      if (weight !== shipment.weight_kg) {
        patch.weight_kg = weight;
      }
      if (values.declared_value.trim() !== shipment.declared_value) {
        patch.declared_value = values.declared_value.trim();
      }
      if (values.shipping_line !== shipment.shipping_line) {
        patch.shipping_line = values.shipping_line as ShipmentPatch["shipping_line"];
      }
      if (values.vessel_size_band !== shipment.vessel_size_band) {
        patch.vessel_size_band = values.vessel_size_band as ShipmentPatch["vessel_size_band"];
      }

      const newArrivalWallTime = values.expected_arrival_at.trim();
      const existingWallTime = utcToPortWallTime(
        shipment.expected_arrival_at,
        portTimezone,
      );

      if (newArrivalWallTime !== existingWallTime) {
        patch.expected_arrival_at = portWallTimeToUtc(
          newArrivalWallTime,
          portTimezone,
        );
      }

      if (values.documentation_status !== shipment.documentation_status) {
        patch.documentation_status = values.documentation_status as ShipmentPatch["documentation_status"];
      }

      await updateShipment(shipment.id, patch, mockError);
      router.push(`/shipments/${shipment.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = mapShipmentValidationDetails(error.details);

        for (const [field, message] of Object.entries(fieldErrors)) {
          if (message) {
            setError(field as any, { type: "server", message });
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
      <div>
        <h1 className="text-2xl font-semibold text-harbor-navy">
          Edit shipment
        </h1>
        <p className="text-sm text-muted mt-1">
          Edit allowed before shipment arrives.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {apiError && (
              <Callout variant="danger">
                {apiError.message}
                {apiError.requestId !== "unknown" && (
                  <span className="text-xs ml-2">
                    Request ID: {apiError.requestId}
                  </span>
                )}
              </Callout>
            )}

            <Field
              id="cargo_type"
              label="Cargo type"
              error={errors.cargo_type?.message}
              required
            >
              <SelectControl
                {...register("cargo_type")}
                options={CARGO_TYPE_SELECT_OPTIONS}
                aria-invalid={!!errors.cargo_type}
              />
            </Field>

            <Field
              id="container_size_ft"
              label="Container size"
              error={errors.container_size_ft?.message}
              required
            >
              <SelectControl
                {...register("container_size_ft")}
                options={CONTAINER_SIZE_SELECT_OPTIONS}
                aria-invalid={!!errors.container_size_ft}
              />
            </Field>

            <Field
              id="hs_code"
              label="HS code"
              hint="6-digit Harmonized System code"
              error={errors.hs_code?.message}
              required
            >
              <Input
                {...register("hs_code")}
                placeholder="850440"
                maxLength={6}
                aria-invalid={!!errors.hs_code}
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
                {...register("weight_kg")}
                type="text"
                inputMode="numeric"
                placeholder="18000"
                aria-invalid={!!errors.weight_kg}
              />
            </Field>

            <Field
              id="declared_value"
              label="Declared value"
              hint="INR, two decimal places"
              error={errors.declared_value?.message}
              required
            >
              <Input
                {...register("declared_value")}
                type="text"
                inputMode="decimal"
                placeholder="2500000.00"
                aria-invalid={!!errors.declared_value}
              />
            </Field>

            <Field
              id="shipping_line"
              label="Shipping line"
              error={errors.shipping_line?.message}
              required
            >
              <SelectControl
                {...register("shipping_line")}
                options={SHIPPING_LINE_SELECT_OPTIONS}
                aria-invalid={!!errors.shipping_line}
              />
            </Field>

            <Field
              id="vessel_size_band"
              label="Vessel size band"
              error={errors.vessel_size_band?.message}
              required
            >
              <SelectControl
                {...register("vessel_size_band")}
                options={VESSEL_SIZE_BAND_SELECT_OPTIONS}
                aria-invalid={!!errors.vessel_size_band}
              />
            </Field>

            <Field
              id="expected_arrival_at"
              label="Expected arrival"
              hint={`Entered in ${portTimezone}; sent to the API as UTC.`}
              error={errors.expected_arrival_at?.message}
              required
            >
              <Input
                {...register("expected_arrival_at")}
                type="datetime-local"
                aria-invalid={!!errors.expected_arrival_at}
              />
            </Field>

            <Field
              id="documentation_status"
              label="Documentation status"
              error={errors.documentation_status?.message}
              required
            >
              <SelectControl
                {...register("documentation_status")}
                options={DOCUMENTATION_STATUS_SELECT_OPTIONS}
                aria-invalid={!!errors.documentation_status}
              />
            </Field>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/shipments/${shipment.id}`)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
