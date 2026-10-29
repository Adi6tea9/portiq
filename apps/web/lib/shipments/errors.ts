import type { ApiError } from "../api/client";
import {
  SHIPMENT_FORM_FIELDS,
  type ShipmentFormField,
} from "./schema";

const FIELD_SET: ReadonlySet<string> = new Set(SHIPMENT_FORM_FIELDS);

export function isShipmentFormField(value: string): value is ShipmentFormField {
  return FIELD_SET.has(value);
}

export function mapShipmentValidationDetails(
  details: ApiError["details"],
): Partial<Record<ShipmentFormField, string>> {
  const errors: Partial<Record<ShipmentFormField, string>> = {};

  for (const detail of details ?? []) {
    if (isShipmentFormField(detail.field) && !errors[detail.field]) {
      errors[detail.field] = detail.issue;
    }
  }

  return errors;
}
