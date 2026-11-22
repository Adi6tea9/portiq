import type { ContainerConfig, LoadingSummary, Parcel, ValidationIssue } from "./types";

/** Tolerance for touching faces, so parcels that share a face don't count as overlapping. */
const EPS = 1e-6;

type Sized = Pick<Parcel, "length" | "width" | "height">;

export function calculateContainerVolume(container: ContainerConfig): number {
  return container.length * container.width * container.height;
}

export function calculateParcelVolume(parcel: Sized, quantity = 1): number {
  return parcel.length * parcel.width * parcel.height * quantity;
}

export function calculateTotalUsedVolume(parcels: readonly Parcel[]): number {
  return parcels.reduce((sum, parcel) => sum + calculateParcelVolume(parcel), 0);
}

export function calculateTotalWeight(parcels: readonly Parcel[]): number {
  return parcels.reduce((sum, parcel) => sum + parcel.weight, 0);
}

export function calculateLoadingSummary(
  container: ContainerConfig,
  parcels: readonly Parcel[],
): LoadingSummary {
  const containerVolume = calculateContainerVolume(container);
  const usedVolume = calculateTotalUsedVolume(parcels);
  const totalWeight = calculateTotalWeight(parcels);

  return {
    containerVolume,
    usedVolume,
    remainingVolume: containerVolume - usedVolume,
    volumeUtilization: containerVolume > 0 ? (usedVolume / containerVolume) * 100 : 0,
    totalWeight,
    maxPayload: container.maxPayload,
    payloadRemaining: container.maxPayload - totalWeight,
    parcelCount: parcels.length,
  };
}

export function hasValidDimensions(parcel: Sized & { weight?: number }): boolean {
  return (
    [parcel.length, parcel.width, parcel.height].every(
      (value) => Number.isFinite(value) && value > 0,
    ) &&
    (parcel.weight === undefined ||
      (Number.isFinite(parcel.weight) && parcel.weight >= 0))
  );
}

export function isWithinBounds(parcel: Parcel, container: ContainerConfig): boolean {
  const { x, y, z } = parcel.position;
  return (
    x >= -EPS &&
    y >= -EPS &&
    z >= -EPS &&
    x + parcel.length <= container.length + EPS &&
    y + parcel.height <= container.height + EPS &&
    z + parcel.width <= container.width + EPS
  );
}

export function parcelsOverlap(a: Parcel, b: Parcel): boolean {
  return (
    a.position.x < b.position.x + b.length - EPS &&
    b.position.x < a.position.x + a.length - EPS &&
    a.position.y < b.position.y + b.height - EPS &&
    b.position.y < a.position.y + a.height - EPS &&
    a.position.z < b.position.z + b.width - EPS &&
    b.position.z < a.position.z + a.width - EPS
  );
}

export function detectParcelOverlaps(
  parcels: readonly Parcel[],
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < parcels.length; i++) {
    for (let j = i + 1; j < parcels.length; j++) {
      if (parcelsOverlap(parcels[i], parcels[j])) {
        pairs.push([parcels[i].id, parcels[j].id]);
      }
    }
  }
  return pairs;
}

export function validatePlacement(
  container: ContainerConfig,
  parcels: readonly Parcel[],
  unplacedIds: readonly string[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const invalid = parcels.filter((parcel) => !hasValidDimensions(parcel));
  if (invalid.length > 0) {
    issues.push({
      code: "invalid-dimensions",
      severity: "error",
      message: `${invalid.length} parcel${invalid.length === 1 ? " has" : "s have"} missing or invalid dimensions or weight.`,
      parcelIds: invalid.map((parcel) => parcel.id),
    });
  }

  const outside = parcels.filter(
    (parcel) => hasValidDimensions(parcel) && !isWithinBounds(parcel, container),
  );
  if (outside.length > 0) {
    issues.push({
      code: "out-of-bounds",
      severity: "error",
      message: `${outside.length} parcel${outside.length === 1 ? " sits" : "s sit"} outside the container walls.`,
      parcelIds: outside.map((parcel) => parcel.id),
    });
  }

  const overlaps = detectParcelOverlaps(
    parcels.filter((parcel) => hasValidDimensions(parcel)),
  );
  if (overlaps.length > 0) {
    issues.push({
      code: "overlap",
      severity: "error",
      message: `${overlaps.length} pair${overlaps.length === 1 ? " of parcels overlaps" : "s of parcels overlap"}.`,
      parcelIds: [...new Set(overlaps.flat())],
    });
  }

  const weight = calculateTotalWeight(parcels);
  if (weight > container.maxPayload) {
    issues.push({
      code: "payload-exceeded",
      severity: "error",
      message: `Load weighs ${Math.round(weight).toLocaleString("en-GB")} kg, over the ${container.maxPayload.toLocaleString("en-GB")} kg payload limit.`,
      parcelIds: [],
    });
  }

  if (unplacedIds.length > 0) {
    issues.push({
      code: "unplaced",
      severity: "warning",
      message: `${unplacedIds.length} parcel${unplacedIds.length === 1 ? " does" : "s do"} not fit and ${unplacedIds.length === 1 ? "was" : "were"} left out.`,
      parcelIds: [...unplacedIds],
    });
  }

  return issues;
}

export interface MatrixCell {
  /** Share of the cell's floor area covered within the layer, 0–1. */
  coverage: number;
  /** Parcel covering the largest part of the cell, if any. */
  parcelId: string | null;
}

export interface UtilizationMatrix {
  columns: number;
  rows: number;
  /** Row-major: index = row * columns + column. Columns run along X, rows along Z. */
  cells: MatrixCell[];
  occupiedShare: number;
}

/**
 * Top-down occupancy for one height band [bottom, top). A parcel counts in the
 * band when its vertical extent intersects it. Coverage is measured per cell
 * from real footprints, so it is exact for non-overlapping parcels.
 */
export function buildUtilizationMatrix(
  container: ContainerConfig,
  parcels: readonly Parcel[],
  cellSize: number,
  bottom: number,
  top: number,
): UtilizationMatrix {
  const columns = Math.ceil(container.length / cellSize - EPS);
  const rows = Math.ceil(container.width / cellSize - EPS);
  const area = new Float64Array(columns * rows);
  const best = new Float64Array(columns * rows);
  const owner: Array<string | null> = new Array(columns * rows).fill(null);

  for (const parcel of parcels) {
    if (
      parcel.position.y >= top - EPS ||
      parcel.position.y + parcel.height <= bottom + EPS
    ) {
      continue;
    }
    const x0 = Math.max(0, parcel.position.x);
    const x1 = Math.min(container.length, parcel.position.x + parcel.length);
    const z0 = Math.max(0, parcel.position.z);
    const z1 = Math.min(container.width, parcel.position.z + parcel.width);
    if (x1 <= x0 || z1 <= z0) continue;

    for (let c = Math.floor(x0 / cellSize); c < columns && c * cellSize < x1; c++) {
      const overlapX = Math.min(x1, (c + 1) * cellSize) - Math.max(x0, c * cellSize);
      if (overlapX <= EPS) continue;
      for (let r = Math.floor(z0 / cellSize); r < rows && r * cellSize < z1; r++) {
        const overlapZ = Math.min(z1, (r + 1) * cellSize) - Math.max(z0, r * cellSize);
        if (overlapZ <= EPS) continue;
        const index = r * columns + c;
        const covered = overlapX * overlapZ;
        area[index] += covered;
        if (covered > best[index]) {
          best[index] = covered;
          owner[index] = parcel.id;
        }
      }
    }
  }

  let occupied = 0;
  const cells: MatrixCell[] = [];
  for (let r = 0; r < rows; r++) {
    const cellWidth = Math.min(cellSize, container.width - r * cellSize);
    for (let c = 0; c < columns; c++) {
      const cellLength = Math.min(cellSize, container.length - c * cellSize);
      const index = r * columns + c;
      const coverage = Math.min(1, area[index] / (cellLength * cellWidth));
      occupied += coverage * cellLength * cellWidth;
      cells.push({ coverage, parcelId: owner[index] });
    }
  }

  return {
    columns,
    rows,
    cells,
    occupiedShare: occupied / (container.length * container.width),
  };
}
