"""Configuration read from the environment variables fixed by backend spec section 3.

Any value here is either an environment variable listed in that section or a documented
local-development default. No other environment variable is read.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from collections.abc import Iterable

DEFAULT_DATABASE_URL = "postgresql+psycopg://portiq:portiq@localhost:5432/portiq"
DEFAULT_ALLOWED_ORIGINS = ["https://portiq-jyb1.vercel.app","http://localhost:3000"]

# CONTRACT-GAP: CG-017 - section 18 says "put the server values into the API .env",
# but section 3 defines environment variables only.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Frozen by backend spec section 4; reused by /config, capacity and at-risk code.
CAPACITY_MODERATE_PCT = 60
CAPACITY_HIGH_PCT = 85
MAX_FORECAST_RANGE_DAYS = 31
DEFAULT_FORECAST_BUCKET: Final[Literal["day"]] = "day"

# CONTRACT-GAP: CG-019 - B10 asks for a request-body cap without a number; the largest real
# body (a tariff or shipment) is a few KB.
MAX_REQUEST_BODY_BYTES = 1_048_576

SUPABASE_REQUIRED_VARIABLES = (
    "SUPABASE_JWT_JWKS_URL",
    "SUPABASE_JWT_ISSUER",
    "SUPABASE_JWT_AUDIENCE",
)

_ENVIRONMENTS = frozenset({"local", "test", "staging", "production"})
_AUTH_MODES = frozenset({"dev", "supabase"})
_LOG_LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})
_URL_REQUIRED_ENVIRONMENTS = frozenset({"staging", "production"})


@dataclass(frozen=True)
class Settings:
    app_env: str
    log_level: str
    database_url: str
    allowed_origins: tuple[str, ...]
    auth_mode: str
    supabase_url: str | None
    supabase_jwt_jwks_url: str | None
    supabase_jwt_issuer: str | None
    supabase_jwt_audience: str | None
    model_path: str | None
    model_version: str | None
    prediction_timeout_seconds: float


def parse_origins(raw: str | Iterable[str] | None) -> tuple[str, ...]:
    if raw is None:
        return ()
    if isinstance(raw, str):
        items = raw.split(",")
    else:
        items = raw
    return tuple(origin.strip() for origin in items if isinstance(origin, str) and origin.strip())


def load_env_file(path: Path = ENV_FILE) -> None:
    """Load ``services/api/.env`` as defaults (CONTRACT-GAP: CG-017).

    Real environment variables always win, no interpolation, and tests never read the
    file so a developer's local Supabase settings cannot change the suite.
    """
    if os.environ.get("APP_ENV") == "test" or not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not name or name.startswith("#"):
            continue
        os.environ.setdefault(name, value.strip().strip('"').strip("'"))


def _optional(source: Mapping[str, str], name: str) -> str | None:
    raw = source.get(name, "").strip()
    return raw or None


def supabase_jwt_settings(env: Mapping[str, str]) -> tuple[str | None, str | None, str]:
    """JWKS URL, issuer and audience, derived from SUPABASE_URL when not set explicitly.

    Supabase serves its signing keys at ``<project>/auth/v1/.well-known/jwks.json`` and signs
    tokens with issuer ``<project>/auth/v1`` and audience ``authenticated``, so the project URL
    alone is enough. Explicit SUPABASE_JWT_* values still win.
    """
    project = (_optional(env, "SUPABASE_URL") or "").rstrip("/")
    auth_base = f"{project}/auth/v1" if project else None
    jwks_url = _optional(env, "SUPABASE_JWT_JWKS_URL") or (
        f"{auth_base}/.well-known/jwks.json" if auth_base else None
    )
    issuer = _optional(env, "SUPABASE_JWT_ISSUER") or auth_base
    audience = _optional(env, "SUPABASE_JWT_AUDIENCE") or "authenticated"
    return jwks_url, issuer, audience


def load_settings(source: Mapping[str, str] | None = None) -> Settings:
    """Build settings from ``source`` (defaults to ``os.environ``), failing fast if invalid."""
    env: Mapping[str, str] = os.environ if source is None else source

    app_env = env.get("APP_ENV", "local").strip() or "local"
    if app_env not in _ENVIRONMENTS:
        raise RuntimeError(f"APP_ENV must be one of {sorted(_ENVIRONMENTS)}, got {app_env!r}")

    auth_mode = env.get("AUTH_MODE", "dev").strip() or "dev"
    if auth_mode not in _AUTH_MODES:
        raise RuntimeError(f"AUTH_MODE must be one of {sorted(_AUTH_MODES)}, got {auth_mode!r}")
    if auth_mode == "dev" and app_env in _URL_REQUIRED_ENVIRONMENTS:
        raise RuntimeError("AUTH_MODE=dev is not allowed when APP_ENV is staging or production")
    jwks_url, issuer, audience = supabase_jwt_settings(env)
    if auth_mode == "supabase":
        resolved = dict(zip(SUPABASE_REQUIRED_VARIABLES, (jwks_url, issuer, audience), strict=True))
        missing = [name for name, value in resolved.items() if not value]
        if missing:
            raise RuntimeError(
                f"{', '.join(missing)} required when AUTH_MODE=supabase "
                "(set SUPABASE_URL and they are derived automatically)"
            )

    log_level = env.get("LOG_LEVEL", "INFO").strip().upper() or "INFO"
    if log_level not in _LOG_LEVELS:
        raise RuntimeError(f"LOG_LEVEL must be one of {sorted(_LOG_LEVELS)}, got {log_level!r}")

    database_url = env.get("DATABASE_URL", "").strip() or DEFAULT_DATABASE_URL
    if app_env in _URL_REQUIRED_ENVIRONMENTS and not env.get("DATABASE_URL", "").strip():
        raise RuntimeError("DATABASE_URL is required when APP_ENV is staging or production")

    raw_timeout = env.get("PREDICTION_TIMEOUT_SECONDS", "5").strip() or "5"
    try:
        prediction_timeout_seconds = float(raw_timeout)
    except ValueError as exc:
        raise RuntimeError(
            f"PREDICTION_TIMEOUT_SECONDS must be a number, got {raw_timeout!r}"
        ) from exc
    if prediction_timeout_seconds <= 0:
        raise RuntimeError("PREDICTION_TIMEOUT_SECONDS must be greater than 0")

    allowed_origins = parse_origins(env.get("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS))

    return Settings(
        app_env=app_env,
        log_level=log_level,
        database_url=database_url,
        allowed_origins=allowed_origins,
        auth_mode=auth_mode,
        supabase_url=_optional(env, "SUPABASE_URL"),
        supabase_jwt_jwks_url=jwks_url,
        supabase_jwt_issuer=issuer,
        supabase_jwt_audience=audience,
        model_path=_optional(env, "MODEL_PATH"),
        model_version=_optional(env, "MODEL_VERSION"),
        prediction_timeout_seconds=prediction_timeout_seconds,
    )


load_env_file()
settings = load_settings()
