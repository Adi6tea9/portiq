// In-memory cargo store for MSW. Packing reuses the engine (metres) and
// reports back in the API's centimetres, with the API's privacy filter.
import type {
  CargoItem,
  ContainerFullDetail,
  ContainerSizeFt,
  LoadPlan,
  PlanContainer,
  SharedContainerSummary,
  Shipment,
} from "../../api/types";
import { CONTAINERS } from "../../load-planner/config";
import { arrangeCargo } from "../../load-planner/packing";
import type { CargoItem as EngineItem, ContainerConfig } from "../../load-planner/types";

interface MockContainer {
  id: string;
  groupKey: string;
  sequence: number;
  size: ContainerSizeFt;
}

const now = "2026-11-20T10:00:00Z";

function line(
  id: string,
  shipmentId: string,
  containerId: string | null,
  fields: Pick<
    CargoItem,
    "name" | "category" | "length_cm" | "width_cm" | "height_cm" | "weight_kg" | "quantity"
  >,
): CargoItem {
  return {
    id,
    shipment_id: shipmentId,
    container_id: containerId,
    stackable: fields.category !== "fragile" && fields.category !== "drum",
    created_at: now,
    updated_at: now,
    ...fields,
  };
}

/** ship_002's group: port_nsa, import, 20 ft, arriving 2026-11-08. */
export const SHARED_GROUP_SHIP_002 = "port_nsa|import|20|2026-11-08";

export const mockContainers: MockContainer[] = [
  { id: "sc_nsa_1", groupKey: SHARED_GROUP_SHIP_002, sequence: 1, size: 20 },
];

export const mockCargo: CargoItem[] = [
  line("cargo_001", "ship_001", null, {
    name: "Transformer crates", category: "crate",
    length_cm: 120, width_cm: 100, height_cm: 100, weight_kg: 260, quantity: 6,
  }),
  line("cargo_002", "ship_001", null, {
    name: "Spare parts", category: "box",
    length_cm: 60, width_cm: 40, height_cm: 40, weight_kg: 18, quantity: 24,
  }),
  line("cargo_003", "ship_002", "sc_nsa_1", {
    name: "Chilled cartons", category: "box",
    length_cm: 60, width_cm: 40, height_cm: 40, weight_kg: 12.5, quantity: 12,
  }),
  // Another owner's cargo in the same shared container: never shown to ship_002's owner.
  line("cargo_ext_1", "ship_ext_901", "sc_nsa_1", {
    name: "Private pallets", category: "pallet",
    length_cm: 120, width_cm: 80, height_cm: 60, weight_kg: 420, quantity: 4,
  }),
  line("cargo_ext_2", "ship_ext_902", "sc_nsa_1", {
    name: "Private drums", category: "drum",
    length_cm: 60, width_cm: 60, height_cm: 90, weight_kg: 190, quantity: 3,
  }),
];

const versions = new Map<string, number>();
const versionKey = (containerId: string | null, shipmentId: string) =>
  containerId ?? `full:${shipmentId}`;

export function bumpVersion(containerId: string | null, shipmentId: string): void {
  const key = versionKey(containerId, shipmentId);
  versions.set(key, (versions.get(key) ?? 1) + 1);
}

export function groupKeyFor(shipment: Shipment): string {
  return [
    shipment.port_id,
    shipment.direction,
    shipment.container_size_ft,
    shipment.expected_arrival_at.slice(0, 10),
  ].join("|");
}

export function groupContainers(shipment: Shipment): MockContainer[] {
  const key = groupKeyFor(shipment);
  return mockContainers
    .filter((container) => container.groupKey === key)
    .sort((a, b) => a.sequence - b.sequence);
}

export function openNextContainer(shipment: Shipment): MockContainer {
  const existing = groupContainers(shipment);
  const container: MockContainer = {
    id: `sc_${crypto.randomUUID().slice(0, 8)}`,
    groupKey: groupKeyFor(shipment),
    sequence: (existing.at(-1)?.sequence ?? 0) + 1,
    size: shipment.container_size_ft,
  };
  mockContainers.push(container);
  return container;
}

function itemsIn(containerId: string | null, shipmentId: string): CargoItem[] {
  return mockCargo.filter((item) =>
    containerId ? item.container_id === containerId : item.shipment_id === shipmentId && !item.container_id,
  );
}

const engineContainer = (size: ContainerSizeFt): ContainerConfig =>
  CONTAINERS[size === 40 ? "40ft" : "20ft"];

const toEngine = (item: CargoItem): EngineItem => ({
  code: item.id,
  categoryId: item.category,
  length: item.length_cm / 100,
  width: item.width_cm / 100,
  height: item.height_cm / 100,
  weight: item.weight_kg,
  quantity: item.quantity,
  stackable: item.stackable,
});

function pack(size: ContainerSizeFt, items: readonly CargoItem[]) {
  return arrangeCargo(engineContainer(size), items.map(toEngine), "largest-first");
}

function fits(size: ContainerSizeFt, items: readonly CargoItem[]): boolean {
  const weight = items.reduce((sum, item) => sum + item.weight_kg * item.quantity, 0);
  return weight <= engineContainer(size).maxPayload && pack(size, items).unplacedIds.length === 0;
}

/**
 * Checks `candidate` against the rest of the container (excluding `replacing`).
 * Returns null when it fits, else the CONTAINER_FULL detail.
 */
export function checkFit(
  size: ContainerSizeFt,
  containerId: string | null,
  sequence: number,
  others: readonly CargoItem[],
  candidate: CargoItem,
): ContainerFullDetail | null {
  if (fits(size, [...others, candidate])) return null;
  // Largest quantity that still packs, by binary search.
  let low = 0;
  let high = candidate.quantity - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(size, [...others, { ...candidate, quantity: mid }])) low = mid;
    else high = mid - 1;
  }
  const config = engineContainer(size);
  const used = others.reduce(
    (sum, item) => sum + (item.length_cm * item.width_cm * item.height_cm * item.quantity) / 1e6,
    0,
  );
  const weight = others.reduce((sum, item) => sum + item.weight_kg * item.quantity, 0);
  return {
    container_id: containerId,
    sequence,
    remaining_volume_m3: Number((config.length * config.width * config.height - used).toFixed(2)),
    remaining_payload_kg: Math.max(0, config.maxPayload - weight),
    fits_quantity: low,
    requested_quantity: candidate.quantity,
  };
}

export function containerItems(containerId: string | null, shipmentId: string): CargoItem[] {
  return itemsIn(containerId, shipmentId);
}

function planContainer(
  size: ContainerSizeFt,
  containerId: string | null,
  sequence: number,
  shipmentId: string,
  seesAll: boolean,
): PlanContainer {
  const items = itemsIn(containerId, shipmentId);
  const config = engineContainer(size);
  const byId = new Map(items.map((item) => [item.id, item]));
  const { parcels, unplacedIds } = pack(size, items);
  let otherIndex = 0;
  const volume = config.length * config.width * config.height;
  const used = parcels.reduce((sum, p) => sum + p.length * p.width * p.height, 0);
  const weight = parcels.reduce((sum, p) => sum + p.weight, 0);
  const cm = (value: number) => Math.round(value * 100);
  return {
    id: containerId,
    sequence,
    container_size_ft: size,
    internal_cm: { length: cm(config.length), width: cm(config.width), height: cm(config.height) },
    max_payload_kg: config.maxPayload,
    version: versions.get(versionKey(containerId, shipmentId)) ?? 1,
    parcels: parcels.map((parcel) => {
      const item = byId.get(parcel.code)!;
      const own = item.shipment_id === shipmentId;
      const unit = Number(parcel.id.slice(parcel.id.lastIndexOf("-") + 1));
      return {
        id: own ? `${item.id}:${unit}` : `o-${String(++otherIndex).padStart(3, "0")}`,
        own,
        position_cm: { x: cm(parcel.position.x), y: cm(parcel.position.y), z: cm(parcel.position.z) },
        size_cm: { length: cm(parcel.length), width: cm(parcel.width), height: cm(parcel.height) },
        rotation_y: parcel.rotationY,
        details:
          own || seesAll
            ? {
                cargo_item_id: item.id,
                name: item.name,
                category: item.category,
                weight_kg: item.weight_kg,
                unit,
                quantity: item.quantity,
                stackable: item.stackable,
              }
            : null,
      };
    }),
    unplaced_count: unplacedIds.length,
    summary: {
      used_volume_m3: Number(used.toFixed(2)),
      remaining_volume_m3: Number((volume - used).toFixed(2)),
      volume_utilization_pct: Number(((used / volume) * 100).toFixed(1)),
      total_weight_kg: weight,
      remaining_payload_kg: Math.max(0, config.maxPayload - weight),
    },
  };
}

export function loadPlanFor(shipment: Shipment, seesAll: boolean): LoadPlan {
  const own = mockCargo.filter((item) => item.shipment_id === shipment.id);
  const containers =
    shipment.booking_type === "shared"
      ? groupContainers(shipment)
          .filter((container) => own.some((item) => item.container_id === container.id))
          .map((c) => planContainer(c.size, c.id, c.sequence, shipment.id, seesAll))
      : own.length > 0
        ? [planContainer(shipment.container_size_ft, null, 1, shipment.id, seesAll)]
        : [];
  return {
    shipment_id: shipment.id,
    booking_type: shipment.booking_type,
    viewer_sees_all: seesAll,
    containers,
  };
}

export function sharedContainerSummaries(shipment: Shipment): SharedContainerSummary[] {
  return groupContainers(shipment).map((container) => {
    const plan = planContainer(container.size, container.id, container.sequence, shipment.id, false);
    return {
      id: container.id,
      sequence: container.sequence,
      container_size_ft: container.size,
      used_volume_m3: plan.summary.used_volume_m3,
      remaining_volume_m3: plan.summary.remaining_volume_m3,
      volume_utilization_pct: plan.summary.volume_utilization_pct,
      total_weight_kg: plan.summary.total_weight_kg,
      max_payload_kg: plan.max_payload_kg,
      shipment_count: new Set(itemsIn(container.id, shipment.id).map((i) => i.shipment_id)).size,
    };
  });
}
