"""Load planner endpoints: cargo lines, shared containers, load plan and its change stream (CG-022).

Every cargo change locks what it packs into (the shipment row for a full booking, the shared
container row otherwise) so two users can never both fill the last space of one container.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse

from app.core.deps import DbSession, require_role
from app.core.errors import AppError, request_id_of
from app.db import SessionLocal
from app.models import CargoItem, Profile, SharedContainer, Shipment
from app.repositories import audit_logs as audit_logs_repo
from app.repositories import cargo as cargo_repo
from app.repositories import operator_ports as operator_ports_repo
from app.repositories import shipments as shipments_repo
from app.repositories.cargo import GroupKey
from app.schemas.cargo import CargoItemAdd, CargoItemPatch, cargo_item_response
from app.schemas.enums import BookingType, CargoCategory, Role, ShipmentStatus
from app.schemas.envelope import ErrorDetail, envelope
from app.services.load_plan import build_plan, line_of, plan_versions, summary
from app.services.packing import (
    CONTAINERS,
    ContainerSpec,
    Line,
    fits_orientation,
    fits_quantity,
    pack,
)

router = APIRouter(prefix="/shipments", tags=["load-planner"])

Reader = Annotated[
    Profile,
    Depends(require_role(Role.IMPORTER_EXPORTER, Role.PORT_OPERATOR, Role.PLATFORM_ADMIN)),
]
Importer = Annotated[Profile, Depends(require_role(Role.IMPORTER_EXPORTER))]

# A line split across more containers than this is almost certainly a mistake.
MAX_CONTAINERS_PER_ADD = 20
# None streams until the client leaves; tests set 0 so a stream ends after its first event.
STREAM_MAX_SECONDS: float | None = None
LINE_FIELDS = (
    "name",
    "category",
    "length_cm",
    "width_cm",
    "height_cm",
    "weight_kg",
    "quantity",
    "stackable",
)


def _not_found() -> AppError:
    return AppError(404, "NOT_FOUND", "Not found")


def _invalid(field: str, issue: str) -> AppError:
    return AppError(
        422, "VALIDATION_ERROR", "Validation failed", [ErrorDetail(field=field, issue=issue)]
    )


def _visible(session: DbSession, user: Profile, shipment_id: UUID) -> Shipment:
    """Owner, the port's operators and admins; anyone else gets a 404."""
    shipment = shipments_repo.get_by_id(session, shipment_id)
    if shipment is None:
        raise _not_found()
    if user.role == Role.PLATFORM_ADMIN:
        return shipment
    if user.role == Role.PORT_OPERATOR:
        if shipment.port_id not in set(operator_ports_repo.list_port_ids(session, user.id)):
            raise _not_found()
    elif shipment.owner_user_id != user.id:
        raise _not_found()
    return shipment


def _writable(session: DbSession, user: Profile, shipment_id: UUID) -> Shipment:
    """The caller's own shipment, locked for this transaction, while it is ``submitted``."""
    shipment = cargo_repo.lock_shipment(session, shipment_id)
    if shipment is None or shipment.owner_user_id != user.id:
        raise _not_found()
    if shipment.status is not ShipmentStatus.SUBMITTED:
        raise AppError(
            409, "STATE_CONFLICT", "Cargo can only change while the shipment is submitted."
        )
    return shipment


def _line(fields: dict[str, Any], key: str = "new") -> Line:
    return Line(
        key=key,
        category=CargoCategory(fields["category"]),
        length=float(fields["length_cm"]),
        width=float(fields["width_cm"]),
        height=float(fields["height_cm"]),
        weight=float(fields["weight_kg"]),
        quantity=int(fields["quantity"]),
        stackable=bool(fields["stackable"]),
    )


def _check_dimensions(spec: ContainerSpec, fields: dict[str, Any]) -> None:
    if not fits_orientation(
        spec, float(fields["length_cm"]), float(fields["width_cm"]), float(fields["height_cm"])
    ):
        raise _invalid("length_cm", "a unit does not fit the container in any orientation")


def _container_full(
    spec: ContainerSpec,
    container: SharedContainer | None,
    others: list[Line],
    fits: int,
    requested: int,
) -> AppError:
    room = summary(spec, others)
    return AppError(
        409,
        "CONTAINER_FULL",
        "This cargo does not fit in the container.",
        [
            {
                "container_id": None if container is None else str(container.id),
                "sequence": 1 if container is None else container.sequence,
                "remaining_volume_m3": room["remaining_volume_m3"],
                "remaining_payload_kg": room["remaining_payload_kg"],
                "fits_quantity": fits,
                "requested_quantity": requested,
            }
        ],
    )


def _require_fit(
    spec: ContainerSpec, container: SharedContainer | None, others: list[Line], line: Line
) -> None:
    if not pack(spec, [*others, line]).fits(spec):
        raise _container_full(
            spec, container, others, fits_quantity(spec, others, line), line.quantity
        )


def _insert(
    session: DbSession,
    shipment: Shipment,
    container: SharedContainer | None,
    fields: dict[str, Any],
) -> CargoItem:
    item = CargoItem(
        shipment_id=shipment.id, container_id=None if container is None else container.id, **fields
    )
    session.add(item)
    session.flush()
    session.refresh(item)
    return item


def _bump(shipment: Shipment, container: SharedContainer | None) -> None:
    if container is None:
        shipment.cargo_version += 1
    else:
        container.version += 1


def _audit(
    session: DbSession,
    user: Profile,
    request: Request,
    action: str,
    item: CargoItem,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> None:
    audit_logs_repo.add(
        session,
        actor_user_id=user.id,
        action=f"cargo.{action}",
        entity_type="cargo_item",
        entity_id=item.id,
        before=before,
        after=after,
        request_id=request_id_of(request),
    )


def _locked(session: DbSession, container_id: UUID) -> SharedContainer:
    container = cargo_repo.lock_container(session, container_id)
    if container is None:
        raise _not_found()
    return container


def _default_container(session: DbSession, key: GroupKey) -> SharedContainer:
    """The group's highest-sequence container, or a new container 1."""
    group = cargo_repo.list_group(session, key)
    return _locked(session, group[-1].id) if group else _next_container(session, key, 0)


def _next_container(session: DbSession, key: GroupKey, after_sequence: int) -> SharedContainer:
    later = [c for c in cargo_repo.list_group(session, key) if c.sequence > after_sequence]
    if later:
        return _locked(session, later[0].id)
    cargo_repo.lock_group(session, key)
    later = [c for c in cargo_repo.list_group(session, key) if c.sequence > after_sequence]
    container = later[0] if later else cargo_repo.create_container(session, key)
    return _locked(session, container.id)


def _add_shared(
    session: DbSession, shipment: Shipment, payload: CargoItemAdd, fields: dict[str, Any]
) -> list[CargoItem]:
    key = GroupKey.of(shipment)
    spec = CONTAINERS[shipment.container_size_ft]
    if payload.container_id is not None:
        target = cargo_repo.lock_container(session, payload.container_id)
        if target is None or not key.matches(target):
            raise _invalid("container_id", "not a container of this shipment's shared group")
    else:
        target = _default_container(session, key)

    created: list[CargoItem] = []
    remaining = int(fields["quantity"])
    for _ in range(MAX_CONTAINERS_PER_ADD):
        others = [line_of(item) for item in cargo_repo.list_in_container(session, target.id)]
        line = _line({**fields, "quantity": remaining})
        fits = fits_quantity(spec, others, line)
        if fits == remaining:
            created.append(_insert(session, shipment, target, {**fields, "quantity": remaining}))
            target.version += 1
            return created
        if not payload.allow_split or (fits == 0 and not others):
            raise _container_full(spec, target, others, fits, remaining)
        if fits:
            created.append(_insert(session, shipment, target, {**fields, "quantity": fits}))
            target.version += 1
            remaining -= fits
        target = _next_container(session, key, target.sequence)
    raise _invalid("quantity", f"would need more than {MAX_CONTAINERS_PER_ADD} containers")


@router.get("/{shipment_id}/cargo")
def list_cargo(
    shipment_id: UUID, request: Request, user: Reader, session: DbSession
) -> dict[str, Any]:
    shipment = _visible(session, user, shipment_id)
    items = cargo_repo.list_for_shipment(session, shipment.id)
    return envelope([cargo_item_response(item) for item in items], request_id_of(request))


@router.post("/{shipment_id}/cargo", status_code=201)
def add_cargo(
    payload: CargoItemAdd, shipment_id: UUID, request: Request, user: Importer, session: DbSession
) -> dict[str, Any]:
    shipment = _writable(session, user, shipment_id)
    fields = payload.model_dump(include=set(LINE_FIELDS))
    _check_dimensions(CONTAINERS[shipment.container_size_ft], fields)

    if shipment.booking_type == BookingType.FULL:
        if payload.container_id is not None:
            raise _invalid("container_id", "a full booking has no shared container")
        spec = CONTAINERS[shipment.container_size_ft]
        others = [line_of(item) for item in cargo_repo.list_for_shipment(session, shipment.id)]
        _require_fit(spec, None, others, _line(fields))
        created = [_insert(session, shipment, None, fields)]
        shipment.cargo_version += 1
    else:
        created = _add_shared(session, shipment, payload, fields)

    for item in created:
        _audit(session, user, request, "created", item, None, cargo_item_response(item))
    session.flush()
    return envelope(
        {"items": [cargo_item_response(item) for item in created]}, request_id_of(request)
    )


@router.patch("/{shipment_id}/cargo/{item_id}")
def update_cargo(
    payload: CargoItemPatch,
    shipment_id: UUID,
    item_id: UUID,
    request: Request,
    user: Importer,
    session: DbSession,
) -> dict[str, Any]:
    shipment = _writable(session, user, shipment_id)
    item = cargo_repo.get_item(session, shipment.id, item_id)
    if item is None:
        raise _not_found()
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        return envelope(cargo_item_response(item), request_id_of(request))

    merged = {field: getattr(item, field) for field in LINE_FIELDS} | changes
    container = None if item.container_id is None else _locked(session, item.container_id)
    spec = CONTAINERS[
        shipment.container_size_ft if container is None else container.container_size_ft
    ]
    _check_dimensions(spec, merged)
    neighbours = (
        cargo_repo.list_for_shipment(session, shipment.id)
        if container is None
        else cargo_repo.list_in_container(session, container.id)
    )
    others = [line_of(other) for other in neighbours if other.id != item.id]
    _require_fit(spec, container, others, _line(merged))

    before = cargo_item_response(item)
    for field, value in changes.items():
        setattr(item, field, value)
    item.updated_at = datetime.now(UTC)
    _bump(shipment, container)
    session.flush()
    _audit(session, user, request, "updated", item, before, cargo_item_response(item))
    return envelope(cargo_item_response(item), request_id_of(request))


@router.delete("/{shipment_id}/cargo/{item_id}", status_code=204)
def delete_cargo(
    shipment_id: UUID, item_id: UUID, request: Request, user: Importer, session: DbSession
) -> Response:
    shipment = _writable(session, user, shipment_id)
    item = cargo_repo.get_item(session, shipment.id, item_id)
    if item is None:
        raise _not_found()
    container = None if item.container_id is None else _locked(session, item.container_id)
    _audit(session, user, request, "deleted", item, cargo_item_response(item), None)
    session.delete(item)
    _bump(shipment, container)
    session.flush()
    return Response(status_code=204)


@router.get("/{shipment_id}/shared-containers")
def list_shared_containers(
    shipment_id: UUID, request: Request, user: Reader, session: DbSession
) -> dict[str, Any]:
    shipment = _visible(session, user, shipment_id)
    if shipment.booking_type != BookingType.SHARED:
        return envelope([], request_id_of(request))
    containers = cargo_repo.list_group(session, GroupKey.of(shipment))
    items = cargo_repo.items_in_containers(session, [c.id for c in containers])
    data = []
    for container in containers:
        spec = CONTAINERS[container.container_size_ft]
        mine = [item for item in items if item.container_id == container.id]
        room = summary(spec, [line_of(item) for item in mine])
        data.append(
            {
                "id": str(container.id),
                "sequence": container.sequence,
                "container_size_ft": container.container_size_ft,
                "used_volume_m3": room["used_volume_m3"],
                "remaining_volume_m3": room["remaining_volume_m3"],
                "volume_utilization_pct": room["volume_utilization_pct"],
                "total_weight_kg": room["total_weight_kg"],
                "max_payload_kg": spec.max_payload_kg,
                "shipment_count": len({item.shipment_id for item in mine}),
            }
        )
    return envelope(data, request_id_of(request))


@router.get("/{shipment_id}/load-plan")
def read_load_plan(
    shipment_id: UUID, request: Request, user: Reader, session: DbSession
) -> dict[str, Any]:
    shipment = _visible(session, user, shipment_id)
    sees_all = user.role in (Role.PORT_OPERATOR, Role.PLATFORM_ADMIN)
    return envelope(build_plan(session, shipment, viewer_sees_all=sees_all), request_id_of(request))


async def version_events(
    load_versions: Callable[[], dict[str, int]],
    is_disconnected: Callable[[], Awaitable[bool]],
    *,
    poll_seconds: float = 1.0,
    ping_seconds: float = 15.0,
    max_seconds: float | None = None,
) -> AsyncIterator[str]:
    """SSE: a ``version`` event on connect and on every change, a ping comment every 15 s."""
    last: dict[str, int] | None = None
    since_ping = 0.0
    started = anyio.current_time()
    while not await is_disconnected():
        versions = await anyio.to_thread.run_sync(load_versions)
        if versions != last:
            last = versions
            yield f"event: version\ndata: {json.dumps({'versions': versions})}\n\n"
        if max_seconds is not None and anyio.current_time() - started >= max_seconds:
            return
        await anyio.sleep(poll_seconds)
        since_ping += poll_seconds
        if since_ping >= ping_seconds:
            since_ping = 0.0
            yield ": ping\n\n"


@router.get("/{shipment_id}/load-plan/stream")
def stream_load_plan(
    shipment_id: UUID, request: Request, user: Reader, session: DbSession
) -> StreamingResponse:
    shipment = _visible(session, user, shipment_id)
    target = shipment.id

    def load_versions() -> dict[str, int]:
        # A fresh short session per tick: the request session must not stay open for hours.
        with SessionLocal() as tick:
            return plan_versions(tick, target)

    return StreamingResponse(
        version_events(load_versions, request.is_disconnected, max_seconds=STREAM_MAX_SECONDS),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
