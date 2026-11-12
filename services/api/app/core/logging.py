"""Structured JSON logging and request-id generation (backend spec 5.9)."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

_REQUEST_FIELDS = (
    "request_id",
    "method",
    "route",
    "status",
    "latency_ms",
    "actor_id",
    "model_version",
    "error_code",
)


def new_request_id() -> str:
    """Generate a request id for envelopes and the X-Request-ID header (CONTRACT-GAP: CG-004)."""
    return str(uuid4())


def _iso(created: float) -> str:
    stamp = datetime.fromtimestamp(created, UTC)
    return stamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")


class JsonFormatter(logging.Formatter):
    """One JSON object per line; request fields are omitted when unset."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": _iso(record.created),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in _REQUEST_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str) -> None:
    """Send all logs to stdout as JSON and suppress uvicorn's plain-text access log."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
    logging.getLogger("uvicorn.access").disabled = True
