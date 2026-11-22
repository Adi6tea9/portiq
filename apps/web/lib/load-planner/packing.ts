import { CARGO_CATEGORIES } from "./config";
import { hasValidDimensions } from "./calculations";
import type { CargoItem, ContainerConfig, Parcel } from "./types";

const EPS = 1e-6;
/** Share of a parcel's footprint that must rest on something below it. */
const MIN_SUPPORT = 0.75;

export type ArrangeOrder = "as-listed" | "largest-first";

export interface ArrangeResult {
  parcels: Parcel[];
  unplacedIds: string[];
}

interface Block {
  u: number;
  y: number;
  z: number;
  len: number;
  h: number;
  w: number;
  stackable: boolean;
}

function intersects(a: Block, b: Block): boolean {
  return (
    a.u < b.u + b.len - EPS &&
    b.u < a.u + a.len - EPS &&
    a.y < b.y + b.h - EPS &&
    b.y < a.y + a.h - EPS &&
    a.z < b.z + b.w - EPS &&
    b.z < a.z + a.w - EPS
  );
}

function supportedArea(block: Block, placed: readonly Block[]): number {
  let area = 0;
  for (const below of placed) {
    if (!below.stackable || Math.abs(below.y + below.h - block.y) > EPS) continue;
    const du =
      Math.min(block.u + block.len, below.u + below.len) - Math.max(block.u, below.u);
    const dz =
      Math.min(block.z + block.w, below.z + below.w) - Math.max(block.z, below.z);
    if (du > EPS && dz > EPS) area += du * dz;
  }
  return area;
}

/**
 * Places every physical parcel with a greedy extreme-point heuristic: cargo is
 * built up in walls from the far end towards the doors, each parcel taking the
 * free spot nearest the far wall, then lowest, then leftmost, and turning 90°
 * when that fits better. It respects walls, overlaps, support and
 * non-stackable cargo. It is a simple heuristic, not an optimiser.
 */
export function arrangeCargo(
  container: ContainerConfig,
  cargo: readonly CargoItem[],
  order: ArrangeOrder = "as-listed",
): ArrangeResult {
  const units = cargo.flatMap((item) =>
    Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, (_, index) => ({
      item,
      id: `${item.code}-${String(index + 1).padStart(2, "0")}`,
    })),
  );

  if (order === "largest-first") {
    units.sort(
      (a, b) =>
        b.item.length * b.item.width * b.item.height -
          a.item.length * a.item.width * a.item.height || b.item.weight - a.item.weight,
    );
  }

  const placed: Block[] = [];
  const parcels: Parcel[] = [];
  const unplacedIds: string[] = [];
  let points: Array<{ u: number; y: number; z: number }> = [{ u: 0, y: 0, z: 0 }];

  for (const { item, id } of units) {
    if (!hasValidDimensions(item)) {
      unplacedIds.push(id);
      continue;
    }
    const stackable = CARGO_CATEGORIES[item.categoryId]?.stackable ?? true;
    const orientations: Array<[number, number, 0 | 90]> = [[item.length, item.width, 0]];
    if (Math.abs(item.length - item.width) > EPS)
      orientations.push([item.width, item.length, 90]);

    let chosen: { block: Block; rotation: 0 | 90 } | null = null;
    for (const point of points) {
      for (const [len, w, rotation] of orientations) {
        const block: Block = { ...point, len, h: item.height, w, stackable };
        if (
          block.u + len > container.length + EPS ||
          block.y + item.height > container.height + EPS ||
          block.z + w > container.width + EPS ||
          placed.some((other) => intersects(block, other)) ||
          (block.y > EPS && supportedArea(block, placed) < MIN_SUPPORT * len * w - EPS)
        ) {
          continue;
        }
        if (
          !chosen ||
          block.u < chosen.block.u - EPS ||
          (Math.abs(block.u - chosen.block.u) <= EPS &&
            (block.y < chosen.block.y - EPS ||
              (Math.abs(block.y - chosen.block.y) <= EPS &&
                block.z < chosen.block.z - EPS)))
        ) {
          chosen = { block, rotation };
        }
      }
    }

    if (!chosen) {
      unplacedIds.push(id);
      continue;
    }

    const { block, rotation } = chosen;
    placed.push(block);
    points = points.filter(
      (p) => !(p.u === block.u && p.y === block.y && p.z === block.z),
    );
    for (const next of [
      { u: block.u + block.len, y: block.y, z: block.z },
      { u: block.u, y: block.y + block.h, z: block.z },
      { u: block.u, y: block.y, z: block.z + block.w },
    ]) {
      if (
        !points.some(
          (p) =>
            Math.abs(p.u - next.u) + Math.abs(p.y - next.y) + Math.abs(p.z - next.z) <
            EPS,
        )
      ) {
        points.push(next);
      }
    }

    parcels.push({
      id,
      code: item.code,
      categoryId: item.categoryId,
      length: block.len,
      width: block.w,
      height: block.h,
      weight: item.weight,
      position: { x: container.length - block.u - block.len, y: block.y, z: block.z },
      rotationY: rotation,
    });
  }

  return { parcels, unplacedIds };
}
