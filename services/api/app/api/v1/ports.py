"""``GET /ports``: ports the caller may use (backend spec section 7)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.core.deps import CurrentUser, DbSession
from app.core.errors import request_id_of
from app.repositories import operator_ports as operator_ports_repo
from app.repositories import ports as ports_repo
from app.schemas.enums import Role
from app.schemas.envelope import envelope
from app.schemas.ports import PortResponse

router = APIRouter(tags=["ports"])


@router.get("/ports")
def list_ports(
    request: Request,
    user: CurrentUser,
    session: DbSession,
) -> dict[str, Any]:
    ports = ports_repo.list_all(session)
    if user.role is Role.PORT_OPERATOR:
        allowed = set(operator_ports_repo.list_port_ids(session, user.id))
        ports = [port for port in ports if port.id in allowed]

    data = [
        PortResponse(
            id=port.id,
            name=port.name,
            port_code=port.port_code,
            timezone=port.timezone,
        ).model_dump(mode="json")
        for port in ports
    ]
    return envelope(data, request_id_of(request))
