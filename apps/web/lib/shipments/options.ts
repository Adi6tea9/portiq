import type {
  CargoPriority,
  CargoType,
  CustomsChannel,
  Direction,
  DocumentationStatus,
  ImporterType,
  ShipmentStatus,
  ShippingLine,
  VesselSizeBand,
} from "../api/types";

export const DIRECTION_OPTIONS = [
  "import",
  "export",
] as const satisfies readonly Direction[];

export const CARGO_TYPE_OPTIONS = [
  "general_container",
  "reefer",
  "hazardous",
  "oversized",
] as const satisfies readonly CargoType[];

export const CONTAINER_SIZE_OPTIONS = ["20", "40"] as const;

export const SHIPPING_LINE_OPTIONS = [
  "Line A",
  "Line B",
  "Line C",
  "Line D",
  "other",
] as const satisfies readonly ShippingLine[];

export const VESSEL_SIZE_BAND_OPTIONS = [
  "small",
  "medium",
  "large",
] as const satisfies readonly VesselSizeBand[];

export const DOCUMENTATION_STATUS_OPTIONS = [
  "complete",
  "incomplete",
  "unknown",
] as const satisfies readonly DocumentationStatus[];

export const CUSTOMS_CHANNEL_OPTIONS = [
  "unknown",
  "green",
  "orange",
  "red",
] as const satisfies readonly CustomsChannel[];

export const IMPORTER_TYPE_OPTIONS = [
  "regular",
  "AEO",
  "new",
] as const satisfies readonly ImporterType[];

export const CARGO_PRIORITY_OPTIONS = [
  "standard",
  "expedited",
  "government",
] as const satisfies readonly CargoPriority[];

/** Display labels for the model-input options (the values are the API's). */
export const MODEL_INPUT_LABELS: Record<string, string> = {
  unknown: "Not known yet",
  green: "Green: no inspection",
  orange: "Orange: document check",
  red: "Red: physical examination",
  regular: "Regular importer",
  AEO: "AEO-certified importer",
  new: "New importer",
  standard: "Standard",
  expedited: "Expedited (perishable / urgent)",
  government: "Government",
};

export const SHIPMENT_STATUS_OPTIONS = [
  "submitted",
  "arrived",
  "cleared",
] as const satisfies readonly ShipmentStatus[];

export function humanizeOption(value: string): string {
  if (value.includes(" ")) {
    return value;
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function containerSizeOptionLabel(value: "20" | "40"): string {
  return `${value} ft`;
}

export function isShipmentStatus(value: string): value is ShipmentStatus {
  return (SHIPMENT_STATUS_OPTIONS as readonly string[]).includes(value);
}
