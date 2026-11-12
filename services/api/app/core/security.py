"""Token verification for both auth modes (backend spec section 7).

``AUTH_MODE=dev`` accepts ``dev:<seeded-email>``. ``AUTH_MODE=supabase`` verifies a
real JWT against the project's JWKS: signature, issuer, audience, expiry and the
required claims. Every failure becomes a 401 with the contract error code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

import jwt
from jwt import PyJWKClient

from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)

DEV_TOKEN_PREFIX = "dev:"
JWKS_CACHE_TTL_SECONDS = 300
JWKS_TIMEOUT_SECONDS = 5
JWT_ALGORITHMS = ("RS256", "ES256")
REQUIRED_CLAIMS = ("exp", "iat", "sub", "aud", "iss")


@dataclass(frozen=True)
class DevIdentity:
    email: str


@dataclass(frozen=True)
class SupabaseIdentity:
    user_id: UUID
    email: str


Identity = DevIdentity | SupabaseIdentity


def unauthorized(message: str = "Invalid or expired token") -> AppError:
    return AppError(401, "UNAUTHENTICATED", message)


def verify_dev_token(token: str) -> DevIdentity:
    """Parse ``dev:<email>``; the profile lookup happens in ``deps``."""
    if not token.startswith(DEV_TOKEN_PREFIX):
        raise unauthorized()
    email = token[len(DEV_TOKEN_PREFIX) :].strip()
    if not email:
        raise unauthorized()
    return DevIdentity(email=email)


_jwks_client: PyJWKClient | None = None
_jwks_client_url: str | None = None


def jwks_client() -> PyJWKClient:
    """Return the cached JWKS client; PyJWKClient refreshes the key set every TTL."""
    global _jwks_client, _jwks_client_url

    url = settings.supabase_jwt_jwks_url
    if url is None:
        raise RuntimeError("SUPABASE_JWT_JWKS_URL is required when AUTH_MODE=supabase")
    if _jwks_client is None or _jwks_client_url != url:
        _jwks_client = PyJWKClient(
            url,
            cache_jwk_set=True,
            lifespan=JWKS_CACHE_TTL_SECONDS,
            timeout=JWKS_TIMEOUT_SECONDS,
        )
        _jwks_client_url = url
    return _jwks_client


def verify_supabase_token(token: str) -> SupabaseIdentity:
    """Verify a Supabase JWT; never trust an unverified payload."""
    try:
        signing_key = jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=list(JWT_ALGORITHMS),
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_jwt_issuer,
            options={"require": list(REQUIRED_CLAIMS)},
        )
    except jwt.PyJWTError as exc:
        logger.info("token_rejected", extra={"reason": type(exc).__name__})
        raise unauthorized() from exc

    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, TypeError, ValueError) as exc:
        logger.info("token_rejected", extra={"reason": "invalid_sub"})
        raise unauthorized() from exc

    email = claims.get("email")
    if not isinstance(email, str) or not email.strip():
        logger.info("token_rejected", extra={"reason": "missing_email"})
        raise unauthorized()
    return SupabaseIdentity(user_id=user_id, email=email.strip())


def resolve_identity(token: str) -> Identity:
    """Verify ``token`` with the configured auth mode."""
    if settings.auth_mode == "dev":
        return verify_dev_token(token)
    return verify_supabase_token(token)
