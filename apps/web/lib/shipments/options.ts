import type {
  CargoType,
  Direction,
  DocumentationStatus,
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
