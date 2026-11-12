"""Authentication/authorization dependencies (backend spec section 7).

The role always comes from ``profiles``, never from a token claim or request body.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import security
from app.core.errors import AppError
from app.db import SessionLocal
from app.models import Profile
from app.repositories import profiles as profiles_repo
from app.schemas.enums import Role

_bearer = HTTPBearer(auto_error=False)

BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def get_db() -> Iterator[Session]:
    """One session per request: commit on success, roll back on any exception."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


DbSession = Annotated[Session, Depends(get_db)]


def _get_or_provision(session: Session, identity: security.SupabaseIdentity) -> Profile:
    """Create an importer profile for a first-time Supabase user (only automatic path)."""
    profile = profiles_repo.get_by_id(session, identity.user_id)
    if profile is not None:
        return profile

    try:
        return profiles_repo.create(
            session,
            user_id=identity.user_id,
            email=identity.email,
            role=Role.IMPORTER_EXPORTER,
        )
    except IntegrityError:
        # A concurrent first request won the insert; use the row it created.
        session.rollback()
        profile = profiles_repo.get_by_id(session, identity.user_id) or profiles_repo.get_by_email(
            session, identity.email
        )
        if profile is None:
            raise
        return profile


def get_current_user(
    request: Request,
    credentials: BearerCredentials,
    session: DbSession,
) -> Profile:
    """Resolve the caller from the bearer token; 401 when it is missing or invalid.

    CONTRACT-GAP: CG-013.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise security.unauthorized("Authentication required")

    identity = security.resolve_identity(credentials.credentials)
    if isinstance(identity, security.DevIdentity):
        profile = profiles_repo.get_by_email(session, identity.email)
        if profile is None:
            raise security.unauthorized("Unknown dev user")
    else:
        profile = _get_or_provision(session, identity)

    if not profile.is_active:
        raise AppError(403, "FORBIDDEN", "Account is inactive")

    request.state.actor_user_id = str(profile.id)
    return profile


CurrentUser = Annotated[Profile, Depends(get_current_user)]


def require_role(*roles: Role) -> Callable[..., Profile]:
    """Dependency factory: allow only the listed roles, 403 otherwise."""
    allowed = frozenset(roles)

    def dependency(user: Annotated[Profile, Depends(get_current_user)]) -> Profile:
        if user.role not in allowed:
            raise AppError(
                403,
                "FORBIDDEN",
                "You do not have permission to perform this action",
            )
        return user

    return dependency
