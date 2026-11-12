"""Database engine, declarative base and readiness probe.

B01 only needs the engine and a connectivity check; tables arrive in B02.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

# Short connect timeout so /ready answers quickly when Postgres is down (CONTRACT-GAP: CG-006).
_CONNECT_TIMEOUT_SECONDS = 3

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": _CONNECT_TIMEOUT_SECONDS},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base for all tables (see ``app.models``)."""


@contextmanager
def session_scope() -> Iterator[Session]:
    """Commit on success, roll back on any exception, always close."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database() -> bool:
    """Return True when a trivial query succeeds (CONTRACT-GAP: CG-006)."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        # Expected when Postgres is down: one line is enough, the 500 path keeps tracebacks.
        logger.warning("database_unavailable: %s", exc)
        return False
    return True

def get_db() -> Iterator[Session]:
    """FastAPI dependency to yield a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()