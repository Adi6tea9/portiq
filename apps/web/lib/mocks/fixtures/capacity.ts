import type { CapacityBucket, ResourceType } from "../../api/types";

const RANGE_START = Date.parse("2026-11-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const GENERATED_AT = "2026-10-29T06:00:00Z";

function bucketStart(dayOffset: number): string {
  return new Date(RANGE_START + dayOffset * DAY_MS).toISOString();
}

function makeBuckets(
  resourceType: ResourceType,
  totalCapacity: number,
  occupied: (dayOffset: number) => number,
): CapacityBucket[] {
  return Array.from({ length: 30 }, (_, dayOffset) => {
    const predictedOccupied = occupied(dayOffset);

    return {
      bucket_start: bucketStart(dayOffset),
      bucket_end: bucketStart(dayOffset + 1),
      resource_type: resourceType,
      predicted_occupied: predictedOccupied,
      total_capacity: totalCapacity,
      utilization_pct: Math.round((predictedOccupied / totalCapacity) * 100),
      source_type: "synthetic",
      model_or_rule_version: "capacity-rules-v1.4",
      generated_at: GENERATED_AT,
    };
  });
}

export const mockYardCapacity: CapacityBucket[] = makeBuckets(
  "yard",
  1000,
  (dayOffset) => {
    if (dayOffset === 10) return 920;
    if (dayOffset === 11) return 880;
    if (dayOffset === 12) return 860;
    return 520 + ((dayOffset * 37) % 300);
  },
);

export const mockBerthCapacity: CapacityBucket[] = makeBuckets(
  "berth",
  120,
  (dayOffset) => {
    if (dayOffset === 10) return 104;
    if (dayOffset === 11) return 102;
    return 58 + ((dayOffset * 11) % 35);
  },
);

export const mockCapacityBuckets: CapacityBucket[] = [
  ...mockYardCapacity,
  ...mockBerthCapacity,
];

export const mockEmptyCapacity: CapacityBucket[] = [];

export const mockInvalidCapacity: CapacityBucket[] = [
  {
    bucket_start: "2026-11-01T00:00:00Z",
    bucket_end: "2026-11-02T00:00:00Z",
    resource_type: "yard",
    predicted_occupied: 0,
    total_capacity: 0,
    utilization_pct: 0,
    source_type: "synthetic",
    model_or_rule_version: "capacity-rules-v1.4",
    generated_at: GENERATED_AT,
  },
];
