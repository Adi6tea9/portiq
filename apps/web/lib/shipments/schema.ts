import { z } from "zod";
import type { ShipmentCreate } from "../api/types";
import {
  CARGO_TYPE_OPTIONS,
  CONTAINER_SIZE_OPTIONS,
  DIRECTION_OPTIONS,
  DOCUMENTATION_STATUS_OPTIONS,
  SHIPPING_LINE_OPTIONS,
  VESSEL_SIZE_BAND_OPTIONS,
} from "./options";

const DECLARED_VALUE_PATTERN = /^\d+\.\d{2}$/;
const HS_CODE_PATTERN = /^\d{6}$/;
const WALL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const shipmentFormSchema = z.object({
  port_id: z
    .string({ required_error: "Select a port." })
    .trim()
    .min(1, "Select a port."),
  reference: z
    .string({ required_error: "Enter a reference." })
    .trim()
    .min(1, "Enter a reference."),
  direction: z.enum(DIRECTION_OPTIONS, {
    errorMap: () => ({ message: "Select a direction." }),
  }),
  cargo_type: z.enum(CARGO_TYPE_OPTIONS, {
    errorMap: () => ({ message: "Select a cargo type." }),
  }),
  container_size_ft: z.enum(CONTAINER_SIZE_OPTIONS, {
    errorMap: () => ({ message: "Select a container size." }),
  }),
  hs_code: z
    .string({ required_error: "Enter the HS code." })
    .trim()
    .regex(HS_CODE_PATTERN, "Enter a 6-digit HS code."),
  weight_kg: z
    .string({ required_error: "Enter the weight." })
    .trim()
    .min(1, "Enter the weight.")
    .refine((value) => {
      const weight = Number(value);
      return Number.isFinite(weight) && weight > 0;
    }, "Weight must be greater than 0."),
  declared_value: z
    .string({ required_error: "Enter the declared value." })
    .trim()
    .min(1, "Enter the declared value.")
    .regex(DECLARED_VALUE_PATTERN, "Enter an amount with two decimal places."),
  currency: z.literal("INR"),
  shipping_line: z.enum(SHIPPING_LINE_OPTIONS, {
    errorMap: () => ({ message: "Select a shipping line." }),
  }),
  vessel_size_band: z.enum(VESSEL_SIZE_BAND_OPTIONS, {
    errorMap: () => ({ message: "Select a vessel size band." }),
  }),
  expected_arrival_at: z
    .string({ required_error: "Enter the expected arrival." })
    .regex(WALL_TIME_PATTERN, "Enter a valid date and time."),
  documentation_status: z.enum(DOCUMENTATION_STATUS_OPTIONS, {
    errorMap: () => ({ message: "Select a documentation status." }),
  }),
});

export type ShipmentFormValues = z.input<typeof shipmentFormSchema>;
export type ShipmentFormField = keyof ShipmentFormValues;

export const SHIPMENT_FORM_FIELDS = [
  "port_id",
  "reference",
  "direction",
  "cargo_type",
  "container_size_ft",
  "hs_code",
  "weight_kg",
  "declared_value",
  "currency",
  "shipping_line",
  "vessel_size_band",
  "expected_arrival_at",
  "documentation_status",
] as const satisfies readonly ShipmentFormField[];

export function toShipmentCreate(
  values: ShipmentFormValues,
  expectedArrivalAt: string,
): ShipmentCreate {
  return {
    port_id: values.port_id.trim(),
    reference: values.reference.trim(),
    direction: values.direction,
    cargo_type: values.cargo_type,
    container_size_ft: values.container_size_ft === "20" ? 20 : 40,
    hs_code: values.hs_code.trim(),
    weight_kg: Number(values.weight_kg),
    declared_value: values.declared_value.trim(),
    currency: values.currency,
    shipping_line: values.shipping_line,
    vessel_size_band: values.vessel_size_band,
    expected_arrival_at: expectedArrivalAt,
    documentation_status: values.documentation_status,
  };
}
