"""``GET /me`` and ``PATCH /me`` (backend spec sections 7 and 8)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.core.deps import CurrentUser, DbSession
from app.core.errors import request_id_of
from app.models import Profile
from app.repositories import operator_ports as operator_ports_repo
from app.schemas.enums import Role
from app.schemas.envelope import envelope
from app.schemas.me import MePatch, MeResponse

router = APIRouter(tags=["me"])


def _me_payload(user: Profile, session: DbSession) -> dict[str, Any]:
    assigned = (
        operator_ports_repo.list_port_ids(session, user.id)
        if user.role is Role.PORT_OPERATOR
        else []
    )
    return MeResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        assigned_port_ids=assigned,
    ).model_dump(mode="json")


@router.get("/me")
def read_me(
    request: Request,
    user: CurrentUser,
    session: DbSession,
) -> dict[str, Any]:
    return envelope(_me_payload(user, session), request_id_of(request))


@router.patch("/me")
def update_me(
    payload: MePatch,
    request: Request,
    user: CurrentUser,
    session: DbSession,
) -> dict[str, Any]:
    user.display_name = payload.display_name
    session.flush()
    return envelope(_me_payload(user, session), request_id_of(request))
