# Load planner: real cargo and shared containers

The build plan and progress tracker, agreed with the project owner on 24 Nov 2026. Each stage is
ticked when its tests pass. The API contract below is what the backend and the frontend build against.

## Decisions

- **Users never arrange cargo.** They enter cargo lines. The server packs them and the 3D view only
  displays the result. There is no manual dragging and no saved hand-made plan: the layout is always
  computed from the cargo lines.
- **Booking type on the shipment.** `full` is a whole container for one shipment. `shared` means
  the shipment shares a container with other shipments.
- **Grouping.** Shared shipments with the same port, direction, container size and arrival date
  (UTC) share containers. Containers are numbered 1, 2, 3… within that group, and a new one opens
  when the user sends cargo to "the next container".
- **Repacking.** Each change repacks the whole container, so other users' parcels may move.
- **Full container.** Adding cargo that does not fit is rejected with `409 CONTAINER_FULL`. The
  response gives the space left and how many units would fit. The user then chooses one of three
  options: put what fits here and send the rest to the next container (`allow_split`), send it all
  to another container (`container_id`), or change the cargo.
- **Privacy is enforced by the API.** For parcels belonging to other shipments the API sends only
  geometry (position, size, rotation). It never sends their name, category, weight, quantity,
  shipment or owner. Operators of the port and the admin see full details.
- **Live updates.** An API stream signals "this container changed". The page then refetches the
  plan through the normal endpoint, so the same privacy filter applies.

## Stages

- [x] **1. Database.** Migration `0003_load_planner`: `shipments.booking_type` (`full`/`shared`,
  default `full`), `shared_containers`, `cargo_items`. Seed: cargo for a few demo shipments and one
  shared container with two owners.
- [x] **2. Packing service.** `app/services/packing.py`, a Python port of
  `apps/web/lib/load-planner/packing.ts` (largest first, 90° turns, 75% support, fragile and
  non-stackable cargo never carries a load). It is deterministic, and the same input gives the
  same layout.
- [x] **3. Cargo API.** List, add, edit and delete cargo lines, with the full-container rules and
  the shared-container list.
- [x] **4. Load-plan API and live stream.** The privacy-filtered plan, and the change stream.
- [x] **5. Frontend data layer.** Types, React Query hooks, the live-stream hook and MSW mocks.
- [x] **6. "Plan this container".** A button on the shipment detail page opens
  `/load-planner?shipment=<id>`. The container size comes from the shipment and is locked. Opening
  `/load-planner` without a shipment keeps the labelled sample demo.
- [x] **7. Cargo panel.** Add, edit and delete cargo lines; the container-full dialog with its
  three choices; a booking-type field on the shipment forms; a read-only view for operators.
- [x] **8. Shared view.** Other shipments' parcels are drawn as grey blocks that cannot be selected.
  Your own parcels can be clicked to show their details. There is a container switcher when a
  shipment's cargo spans several containers.
- [ ] **9. Checks and docs.** Done on 24 Nov: backend 239 passed (ruff, mypy clean), Vitest 207,
  Playwright 90 (5 new in `f11-load-planner.spec.ts`), mock-mode browser check, live database migrated
  to `0003_load_planner`, CG-022 recorded, integration doc and status updated. **Still open:** a
  live-mode check signed in with real accounts (two importers on one shared container, to see the
  live update), which needs the owner's sign-in.

## API contract (CG-022)

Units are centimetres and kilograms in the API, and metres in the 3D engine (the frontend divides
by 100). Every response uses the standard `{data, meta}` envelope.

### Shipment fields

`booking_type: "full" | "shared"`. It is on `Shipment`, optional on `ShipmentCreate` (default
`full`), and editable while the shipment is `submitted` and has no cargo.

### Cargo lines

`CargoItem`:

```json
{ "id": "uuid", "shipment_id": "uuid", "name": "Carton A", "category": "box",
  "length_cm": 60, "width_cm": 40, "height_cm": 40, "weight_kg": 12.5, "quantity": 20,
  "stackable": true, "container_id": "uuid|null", "created_at": "…Z", "updated_at": "…Z" }
```

- `category` is one of `box`, `crate`, `pallet`, `drum`, `fragile` (the engine's categories).
  `drum` is drawn as a cylinder and packed as its bounding box.
- `container_id` is null for a full booking, and the shared container for a shared one.
- The checks are: name 1–80 characters; each dimension 1–1203 cm and no bigger than the container
  in at least one orientation; weight 0.1–30000 kg; quantity 1–500.
  "Orientation" means the 90° floor turn only: height must fit as given (packing never tips
  parcels). Quantity is a whole number. (Clarified by the frontend, 24 Nov.)
- A shared `POST` without `container_id` goes to the group's highest-sequence container, opening
  container 1 when the group has none. `allow_split` applies to shared bookings only; a full booking
  answers `CONTAINER_FULL` and the user changes the cargo. (Clarified by the frontend, 24 Nov; the MSW
  mocks behave this way.)

Endpoints:

| Method and path | Who | Notes |
|---|---|---|
| `GET /shipments/{id}/cargo` | owner, port operator, admin | All of this shipment's lines. |
| `POST /shipments/{id}/cargo` | owner, while `submitted` | Body `CargoItemCreate` plus optional `container_id` and `allow_split` (default false). 201 returns `{items: CargoItem[]}`: one item, or two when split. |
| `PATCH /shipments/{id}/cargo/{item_id}` | owner, while `submitted` | Any create field. The same fit rules apply in the item's own container. |
| `DELETE /shipments/{id}/cargo/{item_id}` | owner, while `submitted` | 204. |
| `GET /shipments/{id}/shared-containers` | owner, port operator, admin | Shared bookings only. Lists the group's containers as `[{id, sequence, container_size_ft, used_volume_m3, remaining_volume_m3, volume_utilization_pct, total_weight_kg, max_payload_kg, shipment_count}]`. `shipment_count` is a number only. |

`409 CONTAINER_FULL` details:

```json
{ "code": "CONTAINER_FULL", "message": "…",
  "details": [{ "container_id": "uuid|null", "sequence": 1, "remaining_volume_m3": 3.2,
                "remaining_payload_kg": 9000, "fits_quantity": 12, "requested_quantity": 20 }] }
```

`fits_quantity` is the largest quantity of this line that still packs. It is 0 when none fits.

Other errors:
- 404 for anyone who cannot see the shipment.
- 403 for operator or admin writes.
- 409 `STATE_CONFLICT` when the shipment is not `submitted`.
- 422 for validation failures, including `container_id` from another group.

### Load plan

`GET /shipments/{id}/load-plan` (owner, port operator, admin):

```json
{ "shipment_id": "uuid", "booking_type": "shared", "viewer_sees_all": false,
  "containers": [{
    "id": "uuid|null", "sequence": 1, "container_size_ft": 40,
    "internal_cm": { "length": 1203, "width": 235, "height": 239 }, "max_payload_kg": 26700,
    "version": 7,
    "parcels": [
      { "id": "item-uuid:3", "own": true, "position_cm": {"x":0,"y":0,"z":0},
        "size_cm": {"length":60,"width":40,"height":40}, "rotation_y": 0,
        "details": { "cargo_item_id": "uuid", "name": "Carton A", "category": "box",
                     "weight_kg": 12.5, "unit": 3, "quantity": 20, "stackable": true } },
      { "id": "o-0c1f…", "own": false, "position_cm": {…}, "size_cm": {…}, "rotation_y": 90,
        "details": null }
    ],
    "unplaced_count": 0,
    "summary": { "used_volume_m3": 9.1, "remaining_volume_m3": 58.4,
                 "volume_utilization_pct": 13.5, "total_weight_kg": 4100,
                 "remaining_payload_kg": 22600 }
  }] }
```

- A full booking has one container with `id: null`. A shared booking lists every shared container
  holding this shipment's cargo, in sequence order. It is empty when there is no cargo yet.
- Parcels from other shipments use an opaque id that is stable for the same layout and is not
  derived from their item id. `details` is null for them, unless `viewer_sees_all` is true (port
  operator or admin), in which case they carry full details and `own` is false.
- `version` changes whenever any cargo in that container changes.

### Live stream

`GET /shipments/{id}/load-plan/stream` returns `text/event-stream` with the same access rules. It
uses the `Authorization` header, so the client reads it with `fetch`, not `EventSource`. It sends
`event: version` with `data: {"versions": {"<container id or 'full'>": 7}}` on connect and whenever
a version changes (checked about once a second), plus a `: ping` comment every 15 s. The client
refetches `/load-plan` when it receives the event.
