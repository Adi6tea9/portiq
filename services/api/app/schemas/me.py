"""``GET /me`` / ``PATCH /me`` shapes (frontend contract 5.4)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.enums import Role

DISPLAY_NAME = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class MePatch(BaseModel):
    """Only ``display_name`` is writable; extra fields (role, owner) are ignored."""

    model_config = ConfigDict(extra="ignore")

    display_name: DISPLAY_NAME


class MeResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    role: Role
    assigned_port_ids: list[UUID]
