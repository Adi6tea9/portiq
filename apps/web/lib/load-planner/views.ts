import type { CameraView, ContainerConfig, Vec3 } from "./types";

/** External shell around the internal space, from the container models. */
const SHELL = { ends: 0.08, sides: 0.12, floor: 0.15, roof: 0.05 };
/** How far the open door leaves reach past the door end and the side walls. */
const DOOR_SWING = { x: 0.6, z: 0.55 };

export type WallPart = "nearSide" | "roof" | "frontEnd";

export interface ViewPreset {
  label: string;
  /** Direction from the target to the camera (any length). */
  direction?: Vec3;
  /** Fixed eye and target, for the interior view. */
  eye?: (c: ContainerConfig) => Vec3;
  target?: (c: ContainerConfig) => Vec3;
  /** Parts of the shell hidden so the cargo stays visible. */
  hide: WallPart[];
}

// The camera works from the +Z side, the only side whose wall markings read
// correctly in the PortIQ models. "Front" is the loading-door end (x = 0).
export const VIEW_PRESETS: Record<CameraView, ViewPreset> = {
  perspective: { label: "Perspective", direction: { x: -1.25, y: 0.5, z: 1 }, hide: [] },
  side: { label: "Side", direction: { x: 0, y: 0.08, z: 1 }, hide: ["nearSide"] },
  front: { label: "Front", direction: { x: -1, y: 0.08, z: 0 }, hide: [] },
  rear: { label: "Rear", direction: { x: 1, y: 0.08, z: 0 }, hide: ["frontEnd"] },
  top: { label: "Top", direction: { x: 0, y: 1, z: 0.001 }, hide: ["roof"] },
  interior: {
    label: "Interior (POV)",
    eye: (c) => ({ x: -0.6, y: 1.55, z: c.width / 2 }),
    target: (c) => ({ x: c.length * 0.7, y: 0.9, z: c.width / 2 }),
    hide: [],
  },
};

export const VIEW_ORDER: CameraView[] = [
  "perspective",
  "side",
  "front",
  "rear",
  "top",
  "interior",
];

/** Box around the container, including the open doors, used for framing. */
export function shellBounds(c: ContainerConfig): { min: Vec3; max: Vec3 } {
  return {
    min: { x: -DOOR_SWING.x, y: -SHELL.floor, z: -DOOR_SWING.z },
    max: { x: c.length + SHELL.ends, y: c.height + SHELL.roof, z: c.width + DOOR_SWING.z },
  };
}

export function boxCenter(c: ContainerConfig): Vec3 {
  const { min, max } = shellBounds(c);
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Distance from the box centre at which a camera looking back along
 * `direction` sees the whole container shell, with `padding` as a share of the
 * frame left free.
 */
export function frameDistance(
  c: ContainerConfig,
  direction: Vec3,
  verticalFovDeg: number,
  aspect: number,
  padding = 0.12,
): number {
  const back = normalize(direction);
  const worldUp = Math.abs(back.y) > 0.99 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(worldUp, back));
  const up = cross(back, right);
  const { min, max } = shellBounds(c);
  const center = boxCenter(c);

  const tanV = Math.tan((verticalFovDeg * Math.PI) / 360) * (1 - padding);
  const tanH = tanV * aspect;
  let distance = 0;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const corner = { x: x - center.x, y: y - center.y, z: z - center.z };
        const depth = dot(corner, back);
        distance = Math.max(
          distance,
          depth + Math.abs(dot(corner, right)) / tanH,
          depth + Math.abs(dot(corner, up)) / tanV,
        );
      }
    }
  }
  return distance;
}

export interface CameraPose {
  eye: Vec3;
  target: Vec3;
}

export function cameraPose(
  view: CameraView,
  c: ContainerConfig,
  verticalFovDeg: number,
  aspect: number,
): CameraPose {
  const preset = VIEW_PRESETS[view];
  if (preset.eye && preset.target) {
    return { eye: preset.eye(c), target: preset.target(c) };
  }
  const target = boxCenter(c);
  const back = normalize(preset.direction ?? { x: 0, y: 0, z: 1 });
  const distance = frameDistance(c, back, verticalFovDeg, aspect);
  return {
    eye: {
      x: target.x + back.x * distance,
      y: target.y + back.y * distance,
      z: target.z + back.z * distance,
    },
    target,
  };
}
