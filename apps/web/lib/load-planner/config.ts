import type { CargoCategory, CargoItem, ContainerConfig, ContainerType } from "./types";

// Internal dimensions are measured from the PortIQ container models
// (containers/container_v3 README). Payloads are typical ISO dry-van values,
// kept here as configurable defaults rather than certified figures.
export const CONTAINERS: Record<ContainerType, ContainerConfig> = {
  "20ft": {
    type: "20ft",
    label: "20 ft (Standard)",
    length: 5.9,
    width: 2.35,
    height: 2.39,
    maxPayload: 28200,
    modelUrl: "/models/container-20ft.glb",
  },
  "40ft": {
    type: "40ft",
    label: "40 ft (Standard)",
    length: 12.03,
    width: 2.35,
    height: 2.39,
    maxPayload: 26700,
    modelUrl: "/models/container-40ft.glb",
  },
};

export const CONTAINER_TYPES = Object.keys(CONTAINERS) as ContainerType[];

export const CARGO_CATEGORIES: Record<string, CargoCategory> = {
  box: { id: "box", name: "Boxes", color: "#c9a06b", shape: "box", stackable: true },
  crate: { id: "crate", name: "Crate", color: "#a8743f", shape: "box", stackable: true },
  pallet: {
    id: "pallet",
    name: "Pallet",
    color: "#d9d4c7",
    shape: "box",
    stackable: true,
  },
  drum: {
    id: "drum",
    name: "Drum",
    color: "#2f5ea3",
    shape: "cylinder",
    stackable: false,
  },
};

/** Sample cargo for the demo. It fits in both container sizes. */
export const SAMPLE_CARGO: CargoItem[] = [
  {
    code: "B1",
    categoryId: "box",
    length: 0.6,
    width: 0.4,
    height: 0.4,
    weight: 18,
    quantity: 40,
  },
  {
    code: "C1",
    categoryId: "crate",
    length: 1.2,
    width: 1.0,
    height: 1.0,
    weight: 260,
    quantity: 6,
  },
  {
    code: "P1",
    categoryId: "pallet",
    length: 1.2,
    width: 0.8,
    height: 0.6,
    weight: 420,
    quantity: 6,
  },
  {
    code: "D1",
    categoryId: "drum",
    length: 0.6,
    width: 0.6,
    height: 0.9,
    weight: 190,
    quantity: 8,
  },
];

/** Floor grid cell size for the utilization matrix. */
export const MATRIX_CELL = 0.2;

/** Height bands the matrix can show, bottom to top. */
export const MATRIX_LAYER_HEIGHT = 0.6;
