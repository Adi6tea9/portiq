"""B02: migrations, constraints and RLS against a real Postgres database."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Port, Profile, Shipment, TariffRule
from app.schemas.enums import (
    CargoType,
    Currency,
    Direction,
    DocumentationStatus,
    RateType,
    Role,
    RuleType,
    ShipmentStatus,
    ShippingLine,
    VesselSizeBand,
)
from tests.conftest import TEST_DATABASE_URL, assert_test_database

SPEC_TABLES = {
    "profiles",
    "ports",
    "operator_ports",
    "shipments",
    "shipment_events",
    "prediction_runs",
    "capacity_forecasts",
    "tariff_rules",
    "audit_logs",
}


def _profile(session: Session, email: str = "constraints@portiq.demo") -> Profile:
    profile = Profile(id=uuid4(), email=email, display_name="Test", role=Role.IMPORTER_EXPORTER)
    session.add(profile)
    session.flush()
    return profile


def _port(session: Session, port_code: str = "INNSA") -> Port:
    port = Port(
        id=uuid4(),
        name="Nhava Sheva (JNPA)",
        port_code=port_code,
        country="India",
        timezone="Asia/Kolkata",
    )
    session.add(port)
    session.flush()
    return port


def _shipment(
    session: Session,
    *,
    owner: Profile,
    port: Port,
    reference: str = "TEST-001",
    weight_kg: Decimal = Decimal("1000.00"),
    hs_code: str = "847130",
) -> Shipment:
    shipment = Shipment(
        id=uuid4(),
        owner_user_id=owner.id,
        port_id=port.id,
        reference=reference,
        direction=Direction.IMPORT,
        cargo_type=CargoType.GENERAL_CONTAINER,
        container_size_ft=40,
        hs_code=hs_code,
        weight_kg=weight_kg,
        declared_value=Decimal("100000.00"),
        currency=Currency.INR,
        shipping_line=ShippingLine.LINE_A,
        vessel_size_band=VesselSizeBand.LARGE,
        expected_arrival_at=datetime(2026, 12, 1, 6, tzinfo=UTC),
        documentation_status=DocumentationStatus.COMPLETE,
        status=ShipmentStatus.SUBMITTED,
    )
    session.add(shipment)
    session.flush()
    return shipment


def _tariff(session: Session, *, valid_from: date, valid_to: date | None) -> TariffRule:
    rule = TariffRule(
        id=uuid4(),
        rule_type=RuleType.PORT_STORAGE,
        rate_type=RateType.PER_DAY,
        rate_value=Decimal("400.00"),
        currency=Currency.INR,
        free_days=1,
        valid_from=valid_from,
        valid_to=valid_to,
        source_note="Test rule",
        version="test-1.0",
        is_active=True,
    )
    session.add(rule)
    session.flush()
    return rule


def test_migrations_apply_from_empty_and_create_every_spec_table(
    migrated_engine: Engine,
) -> None:
    inspector = inspect(migrated_engine)
    tables = set(inspector.get_table_names())
    assert SPEC_TABLES <= tables
    assert "alembic_version" in tables

    with migrated_engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0001_initial"


def test_row_level_security_is_enabled_on_every_table(migrated_engine: Engine) -> None:
    with migrated_engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT tablename, rowsecurity FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename = ANY(:tables)"
            ),
            {"tables": sorted(SPEC_TABLES)},
        ).all()

    assert {row.tablename for row in rows} == SPEC_TABLES
    assert all(row.rowsecurity for row in rows)


def test_weight_zero_is_rejected(db_session: Session) -> None:
    owner = _profile(db_session)
    port = _port(db_session)

    with pytest.raises(IntegrityError, match="ck_shipments_weight_kg"):
        _shipment(db_session, owner=owner, port=port, weight_kg=Decimal("0.00"))


def test_hs_code_must_be_six_digits(db_session: Session) -> None:
    owner = _profile(db_session)
    port = _port(db_session)

    with pytest.raises(IntegrityError, match="ck_shipments_hs_code"):
        _shipment(db_session, owner=owner, port=port, hs_code="84A13")


def test_duplicate_shipment_reference_is_rejected(db_session: Session) -> None:
    owner = _profile(db_session)
    port = _port(db_session)
    _shipment(db_session, owner=owner, port=port, reference="TEST-DUP")

    with pytest.raises(IntegrityError, match="shipments_reference_key"):
        _shipment(db_session, owner=owner, port=port, reference="TEST-DUP")


def test_tariff_valid_to_must_be_after_valid_from(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="ck_tariff_rules_validity"):
        _tariff(
            db_session,
            valid_from=date(2026, 6, 1),
            valid_to=date(2026, 5, 1),
        )


def test_tariff_valid_to_equal_to_valid_from_is_rejected(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="ck_tariff_rules_validity"):
        _tariff(db_session, valid_from=date(2026, 6, 1), valid_to=date(2026, 6, 1))


def test_tariff_rate_value_must_not_be_negative(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="ck_tariff_rules_rate_value"):
        rule = _tariff(db_session, valid_from=date(2026, 1, 1), valid_to=None)
        rule.rate_value = Decimal("-1.00")
        db_session.flush()


def test_operator_ports_reject_unknown_user(db_session: Session) -> None:
    from app.models import OperatorPort

    port = _port(db_session)
    db_session.add(OperatorPort(user_id=UUID(int=1), port_id=port.id))

    with pytest.raises(IntegrityError, match="operator_ports_user_id_fkey"):
        db_session.flush()


@pytest.mark.parametrize(
    ("database_url", "message"),
    [
        (
            "postgresql+psycopg://portiq:portiq@localhost:5432/portiq",
            "does not end with '_test'",
        ),
        (
            "postgresql+psycopg://portiq:portiq@db.example.com:5432/portiq_test",
            "is not localhost",
        ),
    ],
)
def test_schema_reset_guard_refuses_unsafe_database(database_url: str, message: str) -> None:
    with pytest.raises(RuntimeError, match=message):
        assert_test_database(database_url)


def test_schema_reset_guard_accepts_the_test_database() -> None:
    assert_test_database(TEST_DATABASE_URL)
