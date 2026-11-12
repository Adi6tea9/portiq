"""Shared fixtures.

The environment is fixed in ``pytest_configure`` so it is set before any test module
(and therefore ``app.core.config``) is imported. Tests always run against
``portiq_test``: a database test that silently used the dev database would be worse
than no test.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

API_ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = "postgresql+psycopg://portiq:portiq@localhost:5432/portiq_test"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def assert_test_database(database_url: str) -> None:
    """Refuse to touch a database that is not an obviously disposable local test DB."""
    url = make_url(database_url)
    if not (url.database or "").endswith("_test"):
        raise RuntimeError(
            f"refusing to reset schema: database '{url.database}' does not end with '_test'"
        )
    if url.host not in LOCAL_HOSTS:
        raise RuntimeError(f"refusing to reset schema: host '{url.host}' is not localhost")


def pytest_configure(config: pytest.Config) -> None:
    os.environ["APP_ENV"] = "test"
    os.environ.setdefault("LOG_LEVEL", "WARNING")
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL


@pytest.fixture
def app() -> FastAPI:
    from app.main import create_app
    return create_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client



@pytest.fixture(scope="session", autouse=True)
def migrated_engine() -> Iterator[Engine]:
    """Drop the test schema, then run every migration from empty (B02 human check)."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text

    from app.core.config import settings
    from app.db import engine

    assert_test_database(settings.database_url)

    # 1. Connect to the default DB to ensure the test DB exists
    default_db_url = settings.database_url.replace("portiq_test", "portiq")
    setup_engine = create_engine(default_db_url, isolation_level="AUTOCOMMIT")
    with setup_engine.connect() as setup_conn:
        exists = setup_conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = 'portiq_test'")
        ).scalar()
        if not exists:
            setup_conn.execute(text("CREATE DATABASE portiq_test"))
    setup_engine.dispose()

    # 2. Now connect to the test DB, reset the schema, and run migrations
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))

    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    command.upgrade(config, "head")

    yield engine
    engine.dispose()


@pytest.fixture
def db_session(migrated_engine: Engine) -> Iterator[Session]:
    """Session inside a transaction that is always rolled back."""
    connection = migrated_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
