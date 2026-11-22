# Load planner — integration notes

The **Load planner** tab (`/load-planner`, importers and port operators) shows a 20 ft or 40 ft container in
3D with its cargo, a floor utilization matrix and a live loading summary. It runs on sample cargo today. This note
explains how to feed it real shipment data.

## Where things live

| Path (under `apps/web`) | What it is |
|---|---|
| `lib/load-planner/types.ts` | Types: `ContainerConfig`, `CargoItem`, `Parcel`, `LoadingSummary`, `ValidationIssue`, `CameraView` |
| `lib/load-planner/config.ts` | `CONTAINERS` (internal dimensions, payload, model URL), `CARGO_CATEGORIES`, `SAMPLE_CARGO`, matrix settings |
| `lib/load-planner/calculations.ts` | Volume, weight, summary, bounds/overlap/payload validation, utilization matrix |
| `lib/load-planner/packing.ts` | `arrangeCargo()` — turns cargo lines into placed parcels |
| `lib/load-planner/views.ts` | Camera presets and framing maths |
| `components/features/load-planner/LoadPlannerClient.tsx` | The page: owns state and wires the panels together |
| `components/features/load-planner/ContainerViewport.tsx` | The 3D view (lazy-loads `ContainerScene`) plus its toolbar |
| `public/models/container-{20,40}ft.glb` | Compressed container models (see "Models") |

Dependencies: `three@0.170.0`, `@react-three/fiber@8.18.0` (the React 18 line), `@react-three/drei@9.122.0`.

## Units and axes

Metres and kilograms. The origin is the internal bottom corner on the door threshold. +X runs along the length into
the container, +Y is up and +Z runs across the width. The GLB models use the same axes, so parcels and the model
line up without any transform. `Parcel.position` is the parcel's **minimum corner**, and its size is as placed,
after any 90° turn.

## Feeding real cargo

```tsx
import { arrangeCargo } from "@/lib/load-planner/packing";
import { calculateLoadingSummary, validatePlacement } from "@/lib/load-planner/calculations";
import { CONTAINERS } from "@/lib/load-planner/config";

const container = CONTAINERS[shipment.container_size_ft === 40 ? "40ft" : "20ft"];
const cargo: CargoItem[] = shipmentLines.map((line) => ({
  code: line.sku,            // used for parcel IDs: "<code>-01", "<code>-02", …
  categoryId: "box",         // a key of CARGO_CATEGORIES (colour, shape, stackable)
  length: line.length_m, width: line.width_m, height: line.height_m,
  weight: line.weight_kg,    // per parcel
  quantity: line.quantity,
}));

const { parcels, unplacedIds } = arrangeCargo(container, cargo);     // or "largest-first"
const summary = calculateLoadingSummary(container, parcels);
const issues = validatePlacement(container, parcels, unplacedIds);
```

If the backend already returns placements, skip `arrangeCargo` and pass your own `Parcel[]`. `validatePlacement`
still checks them for bounds, overlaps, payload and bad dimensions.

To render the 3D view on its own:

```tsx
const sceneApi = React.useRef<SceneApi | null>(null);

<ContainerViewport
  className="h-[480px]"
  container={container}
  parcels={parcels}
  selectedId={selectedId}
  onSelect={setSelectedId}          // string | null; null when the user clicks empty space
  view={view}                       // "perspective" | "side" | "front" | "rear" | "top" | "interior"
  apiRef={sceneApi}                 // sceneApi.current?.fit(), sceneApi.current?.zoom(1 | -1)
/>
```

The view is controlled: change `view` to move the camera, which glides to the preset framed for the current
container and viewport. Selection is controlled as well. The cargo list, matrix and inspector all read and write the
same `selectedId`. Rotate/pan mode and the wall cutaway are local to the viewport toolbar.

## Calculations and their limits

- **Container volume** = internal L × W × H. **Used volume** = the sum of the parcel volumes (a drum counts as its
  bounding box). **Utilization** = used ÷ container volume × 100.
- A volume figure does not prove that another parcel fits; only placement does.
- **Utilization matrix:** 20 cm floor cells. The height bands are 0.6 m each. A parcel counts in a band when its
  height overlaps it. Coverage per cell is exact for parcels that don't overlap each other.
- **`arrangeCargo`** is a greedy extreme-point heuristic. It builds walls of cargo from the far end towards the
  doors, may turn a parcel 90° about the vertical axis, needs 75% of a footprint supported, and never stacks on
  non-stackable cargo (drums). It is **not an optimiser**: it does not balance weight or axle loads, and it does
  not consider fragility or load order beyond the list order.
- Payload defaults (28,200 kg for 20 ft, 26,700 kg for 40 ft) are typical values. They are not certified and can
  be changed in `CONTAINERS`.

## Performance

- three.js and the scene live in two lazy chunks (~230 KB gzipped together). No other page includes them, and
  `/load-planner` itself has a 106 kB first load.
- The canvas renders **on demand** (`frameloop="demand"`). It only draws when the camera moves or the data changes,
  so an idle page uses no GPU.
- Device pixel ratio is capped at 1.75 and drops automatically while the camera moves (`AdaptiveDpr`). There are no
  real-time shadows: a contact shadow is baked once per container size. Parcels share two geometries and one
  material per category.
- **Models:** the source GLBs (`containers/container_v3`, 7.9 MB and 8.5 MB) were compressed with gltf-transform:
  dedup, textures capped at 2048 px (1024 px for the steel and rear-door maps), WebP textures and meshopt geometry.
  That gives 1.26 MB and 1.41 MB. Node names and axes are unchanged.
- If WebGL fails, the view shows the PortIQ container picture and a message. The cargo list, matrix and summary
  keep working.
- The mouse wheel scrolls the page. Ctrl/⌘ + scroll or a trackpad pinch zooms. Reduced-motion users get instant
  camera moves.

## Not done yet

- No shipment link yet (`/load-planner?shipment=<id>`), and no API for cargo lines. The page uses `SAMPLE_CARGO`.
- No manual drag-to-move for parcels, and no adding cargo in the UI.
- The decals in the models read correctly only from the +Z side, so all cameras work from that side.
