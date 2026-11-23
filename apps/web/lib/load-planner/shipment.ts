// Maps the load-plan API (centimetres) to the 3D engine (metres).
import type {
  CargoItem as ApiCargoItem,
  ContainerSizeFt,
  PlanContainer,
} from "@/lib/api/types";
import { CONTAINERS } from "./config";
import type { CargoItem, ContainerConfig, LoadingSummary, Parcel } from "./types";

const m = (cm: number) => cm / 100;

export function containerTypeFor(size: ContainerSizeFt) {
  return size === 40 ? "40ft" : "20ft";
}

export function containerConfigFor(plan: PlanContainer): ContainerConfig {
  const base = CONTAINERS[containerTypeFor(plan.container_size_ft)];
  return {
    ...base,
    length: m(plan.internal_cm.length),
    width: m(plan.internal_cm.width),
    height: m(plan.internal_cm.height),
    maxPayload: plan.max_payload_kg,
  };
}

/**
 * Parcels without details belong to other shipments: they keep their geometry
 * but lose every identifying field and cannot be selected.
 */
export function toEngineParcels(plan: PlanContainer): Parcel[] {
  return plan.parcels.map((parcel) => {
    const geometry = {
      id: parcel.id,
      length: m(parcel.size_cm.length),
      width: m(parcel.size_cm.width),
      height: m(parcel.size_cm.height),
      position: {
        x: m(parcel.position_cm.x),
        y: m(parcel.position_cm.y),
        z: m(parcel.position_cm.z),
      },
      rotationY: parcel.rotation_y,
    };
    const details = parcel.details;
    if (!details) {
      return { ...geometry, code: "", categoryId: "other", weight: 0, locked: true };
    }
    return {
      ...geometry,
      code: details.cargo_item_id,
      categoryId: details.category,
      weight: details.weight_kg,
      label: `${details.name} #${details.unit}`,
      quantity: details.quantity,
    };
  });
}

export function toEngineCargo(items: readonly ApiCargoItem[]): CargoItem[] {
  return items.map((item) => ({
    code: item.id,
    label: item.name,
    categoryId: item.category,
    length: m(item.length_cm),
    width: m(item.width_cm),
    height: m(item.height_cm),
    weight: item.weight_kg,
    quantity: item.quantity,
    stackable: item.stackable,
  }));
}

/** The server's summary counts every shipment's cargo, including weight we cannot see. */
export function summaryFor(plan: PlanContainer, container: ContainerConfig): LoadingSummary {
  const { summary } = plan;
  return {
    containerVolume: container.length * container.width * container.height,
    usedVolume: summary.used_volume_m3,
    remainingVolume: summary.remaining_volume_m3,
    volumeUtilization: summary.volume_utilization_pct,
    totalWeight: summary.total_weight_kg,
    maxPayload: plan.max_payload_kg,
    payloadRemaining: summary.remaining_payload_kg,
    parcelCount: plan.parcels.length,
  };
}

/** An empty container of the shipment's size, shown before any cargo is added. */
export function emptyPlanContainer(size: ContainerSizeFt): PlanContainer {
  const config = CONTAINERS[containerTypeFor(size)];
  const internal = {
    length: Math.round(config.length * 100),
    width: Math.round(config.width * 100),
    height: Math.round(config.height * 100),
  };
  const volume = (internal.length * internal.width * internal.height) / 1e6;
  return {
    id: null,
    sequence: 1,
    container_size_ft: size,
    internal_cm: internal,
    max_payload_kg: config.maxPayload,
    version: 0,
    parcels: [],
    unplaced_count: 0,
    summary: {
      used_volume_m3: 0,
      remaining_volume_m3: Number(volume.toFixed(2)),
      volume_utilization_pct: 0,
      total_weight_kg: 0,
      remaining_payload_kg: config.maxPayload,
    },
  };
}
