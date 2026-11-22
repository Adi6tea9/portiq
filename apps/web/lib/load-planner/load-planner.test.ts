import { describe, expect, it } from "vitest";
import {
  buildUtilizationMatrix,
  calculateContainerVolume,
  calculateLoadingSummary,
  detectParcelOverlaps,
  isWithinBounds,
  validatePlacement,
} from "./calculations";
import { CONTAINERS, SAMPLE_CARGO } from "./config";
import { arrangeCargo } from "./packing";
import type { Parcel } from "./types";
import { cameraPose, frameDistance, shellBounds } from "./views";

const c20 = CONTAINERS["20ft"];
const c40 = CONTAINERS["40ft"];

function parcel(
  id: string,
  x: number,
  y: number,
  z: number,
  size = 1,
  weight = 10,
): Parcel {
  return {
    id,
    code: id,
    categoryId: "box",
    length: size,
    width: size,
    height: size,
    weight,
    position: { x, y, z },
    rotationY: 0,
  };
}

describe("loading calculations", () => {
  it("uses internal dimensions for container volume", () => {
    expect(calculateContainerVolume(c20)).toBeCloseTo(5.9 * 2.35 * 2.39, 6);
    expect(calculateContainerVolume(c40)).toBeCloseTo(12.03 * 2.35 * 2.39, 6);
  });

  it("sums volume and weight per physical parcel", () => {
    const summary = calculateLoadingSummary(c20, [
      parcel("a", 0, 0, 0),
      parcel("b", 1, 0, 0, 0.5, 30),
    ]);

    expect(summary.usedVolume).toBeCloseTo(1.125, 6);
    expect(summary.totalWeight).toBe(40);
    expect(summary.remainingVolume).toBeCloseTo(summary.containerVolume - 1.125, 6);
    expect(summary.volumeUtilization).toBeCloseTo(
      (1.125 / summary.containerVolume) * 100,
      6,
    );
    expect(summary.payloadRemaining).toBe(c20.maxPayload - 40);
  });

  it("handles an empty container", () => {
    const summary = calculateLoadingSummary(c20, []);
    expect(summary.usedVolume).toBe(0);
    expect(summary.volumeUtilization).toBe(0);
    expect(validatePlacement(c20, [])).toEqual([]);
  });
});

describe("placement validation", () => {
  it("allows touching faces but flags real overlaps", () => {
    expect(detectParcelOverlaps([parcel("a", 0, 0, 0), parcel("b", 1, 0, 0)])).toEqual(
      [],
    );
    expect(detectParcelOverlaps([parcel("a", 0, 0, 0), parcel("b", 0.5, 0, 0)])).toEqual([
      ["a", "b"],
    ]);
  });

  it("flags parcels outside the walls", () => {
    expect(isWithinBounds(parcel("a", 5.4, 0, 0), c20)).toBe(false);
    expect(isWithinBounds(parcel("a", 4.9, 0, 0), c20)).toBe(true);
    const issues = validatePlacement(c20, [parcel("a", 0, 2, 0)]);
    expect(issues.map((issue) => issue.code)).toEqual(["out-of-bounds"]);
  });

  it("flags payload, invalid dimensions and unplaced parcels", () => {
    const broken = { ...parcel("bad", 3, 0, 0), height: Number.NaN };
    const heavy = parcel("heavy", 0, 0, 0, 1, c20.maxPayload + 1);
    const codes = validatePlacement(c20, [broken, heavy], ["x-01"]).map(
      (issue) => issue.code,
    );

    expect(codes).toEqual(["invalid-dimensions", "payload-exceeded", "unplaced"]);
  });
});

describe("arrangeCargo", () => {
  it.each([c20, c40])(
    "fits the sample cargo into the $label container without errors",
    (container) => {
      const { parcels, unplacedIds } = arrangeCargo(container, SAMPLE_CARGO);
      const expected = SAMPLE_CARGO.reduce((sum, item) => sum + item.quantity, 0);

      expect(unplacedIds).toEqual([]);
      expect(parcels).toHaveLength(expected);
      expect(validatePlacement(container, parcels)).toEqual([]);
      expect(new Set(parcels.map((p) => p.id)).size).toBe(expected);
    },
  );

  it("is deterministic and keeps the same result for both orders' totals", () => {
    const first = arrangeCargo(c20, SAMPLE_CARGO, "largest-first");
    const second = arrangeCargo(c20, SAMPLE_CARGO, "largest-first");

    expect(second).toEqual(first);
    expect(calculateLoadingSummary(c20, first.parcels).usedVolume).toBeCloseTo(
      calculateLoadingSummary(c20, arrangeCargo(c20, SAMPLE_CARGO).parcels).usedVolume,
      6,
    );
  });

  it("never stacks on non-stackable cargo", () => {
    const { parcels } = arrangeCargo(c20, [
      {
        code: "D",
        categoryId: "drum",
        length: 0.6,
        width: 0.6,
        height: 0.9,
        weight: 100,
        quantity: 40,
      },
      {
        code: "B",
        categoryId: "box",
        length: 0.6,
        width: 0.6,
        height: 0.4,
        weight: 10,
        quantity: 10,
      },
    ]);
    const drums = parcels.filter((p) => p.code === "D");
    const raised = parcels.filter((p) => p.position.y > 0);

    for (const top of raised) {
      for (const drum of drums) {
        const sharesFootprint =
          top.position.x < drum.position.x + drum.length &&
          drum.position.x < top.position.x + top.length &&
          top.position.z < drum.position.z + drum.width &&
          drum.position.z < top.position.z + top.width;
        expect(sharesFootprint && Math.abs(top.position.y - drum.height) < 1e-6).toBe(
          false,
        );
      }
    }
  });

  it("reports cargo that does not fit and skips invalid lines", () => {
    const { parcels, unplacedIds } = arrangeCargo(c20, [
      {
        code: "L",
        categoryId: "crate",
        length: 6,
        width: 1,
        height: 1,
        weight: 10,
        quantity: 1,
      },
      {
        code: "N",
        categoryId: "box",
        length: 0,
        width: 1,
        height: 1,
        weight: 10,
        quantity: 1,
      },
    ]);
    expect(parcels).toEqual([]);
    expect(unplacedIds).toEqual(["L-01", "N-01"]);
  });
});

describe("buildUtilizationMatrix", () => {
  it("measures exact coverage in the chosen layer", () => {
    const matrix = buildUtilizationMatrix(
      c20,
      [parcel("a", 0, 0, 0), parcel("b", 0, 1.2, 1.1, 0.5)],
      0.2,
      0,
      0.6,
    );

    expect(matrix.columns).toBe(30);
    expect(matrix.rows).toBe(12);
    expect(matrix.cells[0]).toEqual({ coverage: 1, parcelId: "a" });
    expect(matrix.cells[5].coverage).toBe(0);
    expect(matrix.occupiedShare).toBeCloseTo(1 / (5.9 * 2.35), 6);

    const upper = buildUtilizationMatrix(
      c20,
      [parcel("a", 0, 0, 0), parcel("b", 0, 1.2, 1.1, 0.5)],
      0.2,
      1.2,
      1.8,
    );
    expect(upper.occupiedShare).toBeCloseTo(0.25 / (5.9 * 2.35), 6);
    // b starts at z = 1.1, half way through row 5.
    expect(upper.cells[5 * upper.columns].coverage).toBeCloseTo(0.5, 6);
  });
});

describe("camera framing", () => {
  it("keeps every shell corner inside the frame", () => {
    for (const container of [c20, c40]) {
      for (const aspect of [0.6, 1.6]) {
        const { eye, target } = cameraPose("perspective", container, 35, aspect);
        const { min, max } = shellBounds(container);
        expect(
          Math.hypot(eye.x - target.x, eye.y - target.y, eye.z - target.z),
        ).toBeGreaterThan(Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2);
      }
    }
  });

  it("backs off further for a narrow viewport and a longer container", () => {
    const side = { x: 0, y: 0, z: 1 };
    expect(frameDistance(c20, side, 35, 0.6)).toBeGreaterThan(
      frameDistance(c20, side, 35, 1.6),
    );
    expect(frameDistance(c40, side, 35, 1.6)).toBeGreaterThan(
      frameDistance(c20, side, 35, 1.6),
    );
  });
});
