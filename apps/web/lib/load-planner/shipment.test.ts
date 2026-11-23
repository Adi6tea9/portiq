import { describe, expect, it } from "vitest";
import type { PlanContainer } from "@/lib/api/types";
import { parseSseChunk } from "@/lib/api/hooks/useLoadPlan";
import { loadPlanFor } from "@/lib/mocks/fixtures/cargo";
import { mockShipments } from "@/lib/mocks/fixtures/shipments";
import { cargoFormSchema } from "./cargo-schema";
import { containerConfigFor, toEngineParcels } from "./shipment";

const plan: PlanContainer = {
  id: "sc_1",
  sequence: 1,
  container_size_ft: 20,
  internal_cm: { length: 590, width: 235, height: 239 },
  max_payload_kg: 28200,
  version: 3,
  unplaced_count: 0,
  summary: {
    used_volume_m3: 1,
    remaining_volume_m3: 32,
    volume_utilization_pct: 3,
    total_weight_kg: 500,
    remaining_payload_kg: 27700,
  },
  parcels: [
    {
      id: "item-1:1",
      own: true,
      position_cm: { x: 120, y: 40, z: 60 },
      size_cm: { length: 60, width: 40, height: 40 },
      rotation_y: 90,
      details: {
        cargo_item_id: "item-1",
        name: "Carton A",
        category: "box",
        weight_kg: 12.5,
        unit: 1,
        quantity: 20,
        stackable: true,
      },
    },
    {
      id: "o-001",
      own: false,
      position_cm: { x: 0, y: 0, z: 0 },
      size_cm: { length: 120, width: 80, height: 60 },
      rotation_y: 0,
      details: null,
    },
  ],
};

describe("load plan mapping", () => {
  it("converts centimetres to metres", () => {
    const [own] = toEngineParcels(plan);
    expect(own).toMatchObject({
      length: 0.6,
      width: 0.4,
      height: 0.4,
      position: { x: 1.2, y: 0.4, z: 0.6 },
      rotationY: 90,
      label: "Carton A #1",
      categoryId: "box",
      weight: 12.5,
    });
    expect(containerConfigFor(plan)).toMatchObject({ length: 5.9, width: 2.35, height: 2.39 });
  });

  it("makes other shipments' parcels grey, locked and anonymous", () => {
    const [own, other] = toEngineParcels(plan);
    expect(own.locked).toBeFalsy();
    expect(other).toMatchObject({ categoryId: "other", locked: true, weight: 0, code: "" });
    expect(other.label).toBeUndefined();
  });
});

describe("mock load plan privacy", () => {
  const ship002 = mockShipments.find((s) => s.id === "ship_002")!;

  it("hides other owners' details from the owner", () => {
    const parcels = loadPlanFor(ship002, false).containers[0].parcels;
    const others = parcels.filter((p) => !p.own);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((p) => p.details === null && p.id.startsWith("o-"))).toBe(true);
    expect(parcels.some((p) => p.own && p.details)).toBe(true);
  });

  it("shows every detail to staff", () => {
    const parcels = loadPlanFor(ship002, true).containers[0].parcels;
    expect(parcels.every((p) => p.details !== null)).toBe(true);
  });
});

describe("cargo form schema", () => {
  const valid = {
    name: "Carton A",
    category: "box" as const,
    length_cm: "60",
    width_cm: "40",
    height_cm: "40",
    weight_kg: "12.5",
    quantity: "20",
    stackable: true,
  };

  it("accepts a valid line", () => {
    expect(cargoFormSchema(20).safeParse(valid).success).toBe(true);
  });

  it.each([
    ["name", ""],
    ["name", "x".repeat(81)],
    ["weight_kg", "0.05"],
    ["weight_kg", "30001"],
    ["quantity", "0"],
    ["quantity", "501"],
    ["quantity", "2.5"],
    ["length_cm", "0"],
  ])("rejects %s = %j", (field, value) => {
    expect(cargoFormSchema(20).safeParse({ ...valid, [field]: value }).success).toBe(false);
  });

  it("rejects parcels too big for the container in any floor orientation", () => {
    const long = { ...valid, length_cm: "700", width_cm: "100" };
    expect(cargoFormSchema(20).safeParse(long).success).toBe(false);
    expect(cargoFormSchema(40).safeParse(long).success).toBe(true);
    // Turning 90° makes 100 × 590 fit a 20 ft container.
    expect(cargoFormSchema(20).safeParse({ ...valid, length_cm: "100", width_cm: "590" }).success).toBe(true);
    expect(cargoFormSchema(20).safeParse({ ...valid, height_cm: "240" }).success).toBe(false);
  });
});

describe("parseSseChunk", () => {
  it("parses complete events, drops comments and keeps the remainder", () => {
    const { events, rest } = parseSseChunk(
      ': ping\n\nevent: version\ndata: {"versions":{"full":7}}\n\nevent: ver',
    );
    expect(events).toEqual([{ event: "version", data: '{"versions":{"full":7}}' }]);
    expect(rest).toBe("event: ver");
  });

  it("handles CRLF and multi-line data", () => {
    const { events } = parseSseChunk("event: version\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(events).toEqual([{ event: "version", data: "a\nb" }]);
  });
});
