"""Profile reads and writes (role always comes from the database, never a request body)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Profile
from app.schemas.enums import Role


def get_by_id(session: Session, user_id: UUID) -> Profile | None:
    return session.get(Profile, user_id)


def get_by_email(session: Session, email: str) -> Profile | None:
    return session.scalar(select(Profile).where(Profile.email == email))


def create(
    session: Session,
    *,
    email: str,
    role: Role,
    display_name: str | None = None,
    user_id: UUID | None = None,
) -> Profile:
    profile = Profile(email=email, role=role, display_name=display_name, id=user_id)
    session.add(profile)
    session.flush()
    return profile
