import { describe, expect, it } from "vitest";
import { mapShipmentValidationDetails } from "./errors";
import {
  SHIPMENT_FORM_FIELDS,
  shipmentFormSchema,
  toShipmentCreate,
  type ShipmentFormValues,
} from "./schema";

const validValues: ShipmentFormValues = {
  port_id: "port_nsa",
  reference: "SHIP-2026-100",
  direction: "import",
  cargo_type: "general_container",
  container_size_ft: "40",
  hs_code: "850440",
  weight_kg: "18000",
  declared_value: "2500000.00",
  currency: "INR",
  shipping_line: "Line A",
  vessel_size_band: "large",
  expected_arrival_at: "2026-11-05T08:30",
  documentation_status: "complete",
};

function fieldError(field: string, value: unknown): string | undefined {
  const result = shipmentFormSchema.safeParse({
    ...validValues,
    [field]: value,
  });

  if (result.success) {
    return undefined;
  }

  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("shipmentFormSchema", () => {
  it("accepts a complete form", () => {
    expect(shipmentFormSchema.safeParse(validValues).success).toBe(true);
  });

  it("requires a port and trims the reference", () => {
    expect(fieldError("port_id", "")).toBe("Select a port.");
    expect(fieldError("reference", "   ")).toBe("Enter a reference.");
  });

  it("requires every enum field", () => {
    expect(fieldError("direction", "sideways")).toBe("Select a direction.");
    expect(fieldError("cargo_type", "liquid")).toBe("Select a cargo type.");
    expect(fieldError("container_size_ft", "45")).toBe(
      "Select a container size.",
    );
    expect(fieldError("shipping_line", "Line Z")).toBe(
      "Select a shipping line.",
    );
    expect(fieldError("vessel_size_band", "huge")).toBe(
      "Select a vessel size band.",
    );
    expect(fieldError("documentation_status", "partial")).toBe(
      "Select a documentation status.",
    );
  });

  it("requires a positive weight", () => {
    expect(fieldError("weight_kg", "")).toBe("Enter the weight.");
    expect(fieldError("weight_kg", "0")).toBe(
      "Weight must be greater than 0.",
    );
    expect(fieldError("weight_kg", "-1")).toBe(
      "Weight must be greater than 0.",
    );
    expect(fieldError("weight_kg", "not-a-number")).toBe(
      "Weight must be greater than 0.",
    );
  });

  it("requires a six-digit HS code", () => {
    expect(fieldError("hs_code", "12345")).toBe("Enter a 6-digit HS code.");
    expect(fieldError("hs_code", "abcdef")).toBe("Enter a 6-digit HS code.");
    expect(fieldError("hs_code", "850440")).toBeUndefined();
  });

  it("requires a decimal value with exactly two places", () => {
    expect(fieldError("declared_value", "100")).toBe(
      "Enter an amount with two decimal places.",
    );
    expect(fieldError("declared_value", "100.5")).toBe(
      "Enter an amount with two decimal places.",
    );
    expect(fieldError("declared_value", "-1.00")).toBe(
      "Enter an amount with two decimal places.",
    );
    expect(fieldError("declared_value", "100.50")).toBeUndefined();
  });

  it("requires a wall-clock expected arrival", () => {
    expect(fieldError("expected_arrival_at", "2026-11-05")).toBe(
      "Enter a valid date and time.",
    );
    expect(fieldError("expected_arrival_at", "2026-11-05T08:30")).toBeUndefined();
  });

  it("lists every form field once", () => {
    expect(new Set(SHIPMENT_FORM_FIELDS).size).toBe(
      SHIPMENT_FORM_FIELDS.length,
    );
  });
});

describe("toShipmentCreate", () => {
  it("converts form strings to the API payload and excludes server fields", () => {
    const payload = toShipmentCreate(validValues, "2026-11-05T03:00:00.000Z");

    expect(payload).toEqual({
      port_id: "port_nsa",
      reference: "SHIP-2026-100",
      direction: "import",
      cargo_type: "general_container",
      container_size_ft: 40,
      hs_code: "850440",
      weight_kg: 18000,
      declared_value: "2500000.00",
      currency: "INR",
      shipping_line: "Line A",
      vessel_size_band: "large",
      expected_arrival_at: "2026-11-05T03:00:00.000Z",
      documentation_status: "complete",
    });
    expect(payload).not.toHaveProperty("owner_id");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("role");
  });

  it("converts a 20 ft container to a number", () => {
    const payload = toShipmentCreate(
      { ...validValues, container_size_ft: "20" },
      "2026-11-05T03:00:00.000Z",
    );

    expect(payload.container_size_ft).toBe(20);
  });
});

describe("mapShipmentValidationDetails", () => {
  it("maps known fields and ignores unknown or duplicate fields", () => {
    expect(
      mapShipmentValidationDetails([
        { field: "weight_kg", issue: "Must be greater than 0." },
        { field: "unknown_field", issue: "Ignored." },
        { field: "weight_kg", issue: "Second issue." },
        { field: "hs_code", issue: "Must be exactly 6 digits." },
      ]),
    ).toEqual({
      weight_kg: "Must be greater than 0.",
      hs_code: "Must be exactly 6 digits.",
    });
  });

  it("returns no errors when details are absent", () => {
    expect(mapShipmentValidationDetails(undefined)).toEqual({});
  });
});
