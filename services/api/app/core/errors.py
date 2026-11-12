"""Error types and handlers producing the frontend contract 5.1 error envelope."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import new_request_id
from app.schemas.envelope import ErrorBody, ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)

_DEFAULT_MESSAGES: dict[int, str] = {
    400: "Bad request",
    401: "Authentication required",
    403: "You do not have permission to perform this action",
    404: "Not found",
    409: "That status change is not allowed.",
    422: "Invalid request",
    429: "Too many requests",
    500: "An unexpected error occurred",
    503: "Service unavailable",
}

_STATUS_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "STATE_CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "MODEL_UNAVAILABLE",
}

_LOCATION_PREFIXES = frozenset({"body", "query", "path", "header", "cookie"})


def error_code_for_status(status_code: int) -> str:
    """Map an HTTP status to a contract error code (CONTRACT-GAP: CG-003)."""
    known = _STATUS_CODES.get(status_code)
    if known is not None:
        return known
    return "BAD_REQUEST" if status_code < 500 else "INTERNAL_ERROR"


class AppError(Exception):
    """Raised by feature code to produce a contract error response with an exact code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def request_id_of(request: Request) -> str:
    """Request id set by the middleware, or a fresh one when the middleware did not run."""
    request_id = getattr(request.state, "request_id", None)
    return request_id if isinstance(request_id, str) else new_request_id()


def error_response(
    request_id: str,
    status_code: int,
    code: str,
    message: str,
    details: list[ErrorDetail] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(code=code, message=message, details=details, request_id=request_id)
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(exclude_none=True),
        headers={"X-Request-ID": request_id},
    )


def validation_details(exc: Exception) -> list[ErrorDetail]:
    """Flatten Pydantic errors to ``{field, issue}`` using JSON field names.

    CONTRACT-GAP: CG-007.
    """
    if not isinstance(exc, RequestValidationError):
        return []
    details: list[ErrorDetail] = []
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            details.append(ErrorDetail(field="body", issue=str(error.get("msg", "Invalid JSON"))))
            continue
        parts = [str(part) for part in error.get("loc", ()) if str(part) not in _LOCATION_PREFIXES]
        details.append(
            ErrorDetail(
                field=".".join(parts) or "body",
                issue=str(error.get("msg", "Invalid value")),
            )
        )
    return details


async def _handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AppError):
        return await _handle_unexpected(request, exc)
    request.state.error_code = exc.code
    return error_response(
        request_id_of(request), exc.status_code, exc.code, exc.message, exc.details
    )


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        return await _handle_unexpected(request, exc)
    code = error_code_for_status(exc.status_code)
    request.state.error_code = code
    detail: Any = exc.detail
    message = (
        detail
        if isinstance(detail, str) and detail
        else _DEFAULT_MESSAGES.get(exc.status_code, "Request failed")
    )
    return error_response(request_id_of(request), exc.status_code, code, message)


async def _handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    request.state.error_code = "VALIDATION_ERROR"
    return error_response(
        request_id_of(request),
        422,
        "VALIDATION_ERROR",
        "Validation failed",
        validation_details(exc),
    )


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    request_id = request_id_of(request)
    request.state.error_code = "INTERNAL_ERROR"
    logger.error("unhandled_exception", exc_info=exc, extra={"request_id": request_id})
    return error_response(request_id, 500, "INTERNAL_ERROR", _DEFAULT_MESSAGES[500])


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(Exception, _handle_unexpected)
