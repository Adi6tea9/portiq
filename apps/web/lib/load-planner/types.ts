// Units are metres and kilograms. Axes match the container GLBs: origin at the
// internal bottom corner on the door threshold, +X along the length (into the
// container), +Y up, +Z across the width.

export type ContainerType = "20ft" | "40ft";

export type CameraView = "perspective" | "side" | "front" | "rear" | "top" | "interior";

export type ParcelShape = "box" | "cylinder";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ContainerConfig {
  type: ContainerType;
  label: string;
  /** Internal clear dimensions. */
  length: number;
  width: number;
  height: number;
  maxPayload: number;
  modelUrl: string;
}

export interface CargoCategory {
  id: string;
  name: string;
  color: string;
  shape: ParcelShape;
  /** Whether other cargo may rest on top of it. */
  stackable: boolean;
}

/** A line on the cargo list: one kind of parcel and how many of it. */
export interface CargoItem {
  code: string;
  categoryId: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  quantity: number;
  /** Display name; falls back to `code`. */
  label?: string;
  /** False keeps load off this line even if its category is stackable. */
  stackable?: boolean;
}

/** One physical parcel. Dimensions are as placed (after any rotation). */
export interface Parcel {
  id: string;
  code: string;
  categoryId: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  /** Minimum corner, so the parcel spans position → position + size. */
  position: Vec3;
  /** Rotation about the vertical axis, in degrees (0 or 90). */
  rotationY: 0 | 90;
  /** Display name; falls back to `id`. */
  label?: string;
  /** Another shipment's parcel: drawn grey, cannot be selected, no details. */
  locked?: boolean;
  /** Units on its cargo line, when the server shared the details. */
  quantity?: number;
}

export interface LoadingSummary {
  containerVolume: number;
  usedVolume: number;
  remainingVolume: number;
  volumeUtilization: number;
  totalWeight: number;
  maxPayload: number;
  payloadRemaining: number;
  parcelCount: number;
}

export type ValidationCode =
  "invalid-dimensions" | "out-of-bounds" | "overlap" | "payload-exceeded" | "unplaced";

export interface ValidationIssue {
  code: ValidationCode;
  severity: "error" | "warning";
  message: string;
  parcelIds: string[];
}
