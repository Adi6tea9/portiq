"""PortIQ API application factory, request middleware, CORS and ops endpoints."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# from app.api.v1 import capacity
from pathlib import Path
from app.services.ml import dwell_model

from app.api.v1 import api_router
from app.api.v1 import admin , predict , shipments , operator
from app.core.config import settings
from app.core.errors import error_response, register_exception_handlers, request_id_of
from app.core.logging import configure_logging, new_request_id
from app.db import check_database
from app.schemas.envelope import ErrorDetail, envelope

logger = logging.getLogger("portiq.request")

_READINESS_EXPECTED = {"database": "ok", "model": "loaded"}

router = APIRouter(tags=["ops"])

def model_is_loaded() -> bool:
    """Returns True if the ML model successfully loaded into memory."""
    from app.services.ml import dwell_model
    return dwell_model.is_loaded




def readiness_error_code(checks: dict[str, str]) -> str:
    """Pick the error code for a 503 readiness body (CONTRACT-GAP: CG-001)."""
    if checks.get("model") != _READINESS_EXPECTED["model"]:
        return "MODEL_UNAVAILABLE"
    return "INTERNAL_ERROR"


def health_payload(request_id: str) -> dict[str, Any]:
    """Health body: the standard success envelope with `data: {"status":"ok"}` (backend spec 8)."""
    return envelope({"status": "ok"}, request_id)


class RequestContextMiddleware:
    """Assign a request id, expose it as X-Request-ID and log one structured line per request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = new_request_id()
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        started = time.perf_counter()
        status_code = 500

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception as exc:  # noqa: BLE001 - boundary: never leak a traceback
            logger.error(
                "unhandled_exception",
                exc_info=exc,
                extra={"request_id": request_id, "error_code": "INTERNAL_ERROR"},
            )
            status_code = 500
            state["error_code"] = "INTERNAL_ERROR"
            response = error_response(
                request_id, 500, "INTERNAL_ERROR", "An unexpected error occurred"
            )
            await response(scope, receive, send)
        finally:
            _log_request(scope, request_id, status_code, started)


def _log_request(scope: Scope, request_id: str, status_code: int, started: float) -> None:
    route = scope.get("route")
    path = getattr(route, "path", None) or scope.get("path", "")
    state = scope.get("state") or {}
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": scope.get("method", ""),
            "route": path,
            "status": status_code,
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "actor_id": state.get("actor_user_id"),
            "model_version": settings.model_version,
            "error_code": state.get("error_code"),
        },
    )


@router.get("/health")
def health(request: Request) -> dict[str, Any]:
    return health_payload(request_id_of(request))


@router.get("/ready")
def ready(request: Request) -> JSONResponse:
    request_id = request_id_of(request)
    checks = {
        "database": "ok" if check_database() else "error",
        "model": "loaded" if model_is_loaded() else "not_loaded",
    }
    if checks == _READINESS_EXPECTED:
        return JSONResponse(envelope({"status": "ready", "checks": checks}, request_id))

    failing = [
        ErrorDetail(field=component, issue=state)
        for component, state in checks.items()
        if state != _READINESS_EXPECTED.get(component)
    ]
    request.state.error_code = readiness_error_code(checks)
    return error_response(
        request_id, 503, readiness_error_code(checks), "Service is not ready", failing
    )


def create_app() -> FastAPI:
    configure_logging(settings.log_level)
    
    # --- B07: LOAD THE ML MODEL ---
    # __file__ is app/main.py. parents[3] dynamically finds the root 'portiq' folder.
    root_dir = Path(__file__).resolve().parents[3]
    model_path = root_dir / "ml" / "artifacts" / "dwell_model_v1.joblib"
    dwell_model.load(model_path)
    
    app = FastAPI(title="PortIQ API", version="0.1.0")
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    register_exception_handlers(app)
    app.include_router(router)
    app.include_router(api_router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(operator.router, prefix="/api/v1")
  #  app.include_router(capacity.router, prefix="/api/v1/capacity", tags=["capacity"])
    return app


app = create_app()
