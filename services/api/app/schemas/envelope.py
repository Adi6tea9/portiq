"""Response envelope models and helpers (frontend contract 5.1)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel


class Pagination(BaseModel):
    page: int
    page_size: int
    total: int


class Meta(BaseModel):
    request_id: str
    generated_at: str
    pagination: Pagination | None = None


class ErrorDetail(BaseModel):
    field: str
    issue: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody


def utc_now_iso() -> str:
    """UTC ISO-8601 with milliseconds, always ending in ``Z`` (backend spec 5.1)."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def envelope(
    data: Any,
    request_id: str,
    pagination: Pagination | None = None,
) -> dict[str, Any]:
    """Wrap ``data`` in the success envelope from frontend contract 5.1."""
    meta = Meta(request_id=request_id, generated_at=utc_now_iso(), pagination=pagination)
    return {"data": data, "meta": meta.model_dump(exclude_none=True)}
