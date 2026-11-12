"""``GET /ports`` shape (frontend contract 5.4)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class PortResponse(BaseModel):
    id: UUID
    name: str
    port_code: str
    timezone: str
