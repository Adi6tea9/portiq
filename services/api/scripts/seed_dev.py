"""Development seed: ports, users, demo tariffs (backend spec section 12) and 12 shipments.

Idempotent: every row gets a deterministic UUID derived from its natural key, and a
re-run only inserts what is missing. Dev only: refuses anything except ``local``/``test``.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

if __package__ in (None, ""):
    # Backend spec B02 human check runs `python scripts/seed_dev.py`; make `app` importable.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import session_scope
from app.models import (
    AuditLog,
    CapacityForecast,
    OperatorPort,
    Port,
    PredictionRun,
    Profile,
    Shipment,
    ShipmentEvent,
    TariffRule,
)
from app.repositories import operator_ports as operator_ports_repo
from app.repositories import ports as ports_repo
from app.repositories import profiles as profiles_repo
from app.repositories import shipments as shipments_repo
from app.repositories import tariffs as tariffs_repo
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

DEV_ENVIRONMENTS = frozenset({"local", "test"})
SEED_NAMESPACE = UUID("5b0f0b2e-6f4b-4e8e-9a2f-9d0f4c1a7e33")
VALID_FROM = date(2026, 1, 1)
DEMO_NOTE = "Demo tariff data"
DEMO_VERSION = "demo-1.0"

PORTS: tuple[dict[str, Any], ...] = (
    {
        "code": "INNSA",
        "name": "Nhava Sheva (JNPA)",
        "country": "India",
        "timezone": "Asia/Kolkata",
    },
    {
        "code": "INMUN",
        "name": "Mundra",
        "country": "India",
        "timezone": "Asia/Kolkata",
    },
)

USERS: tuple[dict[str, Any], ...] = (
    {
        "email": "importer@portiq.demo",
        "display_name": "Demo Importer",
        "role": Role.IMPORTER_EXPORTER,
        "ports": (),
    },
    {
        "email": "importer2@portiq.demo",
        "display_name": "Demo Importer Two",
        "role": Role.IMPORTER_EXPORTER,
        "ports": (),
    },
    {
        "email": "operator@portiq.demo",
        "display_name": "Demo Operator",
        "role": Role.PORT_OPERATOR,
        "ports": ("INNSA", "INMUN"),
    },
    {
        "email": "operator2@portiq.demo",
        "display_name": "Demo Operator Two",
        "role": Role.PORT_OPERATOR,
        "ports": ("INNSA",),
    },
    {
        "email": "admin@portiq.demo",
        "display_name": "Demo Admin",
        "role": Role.PLATFORM_ADMIN,
        "ports": (),
    },
)

# Backend spec section 12 demo tariffs: 5 customs_duty + 2 port_storage + 4 demurrage
# + 1 other_charge = 12 rules.
_TIERED_DEMURRAGE = {
    "tiers": [
        {"up_to_days": 3, "rate": "1000.00"},
        {"up_to_days": None, "rate": "2000.00"},
    ]
}

TARIFFS: tuple[dict[str, Any], ...] = (
    *(
        {
            "rule_type": RuleType.CUSTOMS_DUTY,
            "rate_type": RateType.PERCENT_OF_VALUE,
            "rate_value": Decimal(rate),
            "hs_code_prefix": hs_code_prefix,
        }
        for hs_code_prefix, rate in (
            ("85", "10.00"),
            ("84", "7.50"),
            ("29", "5.00"),
            ("02", "30.00"),
            ("08", "20.00"),
        )
    ),
    *(
        {
            "rule_type": RuleType.PORT_STORAGE,
            "rate_type": RateType.PER_DAY,
            "rate_value": Decimal(rate),
            "free_days": 1,
            "container_size_ft": size,
        }
        for size, rate in ((20, "400.00"), (40, "700.00"))
    ),
    {
        "rule_type": RuleType.DEMURRAGE,
        "rate_type": RateType.TIERED,
        "rate_value": Decimal("0.00"),
        "shipping_line": ShippingLine.LINE_A,
        "free_days": 1,
        "tier_config": _TIERED_DEMURRAGE,
    },
    {
        "rule_type": RuleType.DEMURRAGE,
        "rate_type": RateType.PER_DAY,
        "rate_value": Decimal("1500.00"),
        "shipping_line": ShippingLine.LINE_B,
        "free_days": 2,
    },
    {
        "rule_type": RuleType.DEMURRAGE,
        "rate_type": RateType.PER_DAY,
        "rate_value": Decimal("1800.00"),
        "shipping_line": ShippingLine.LINE_C,
        "free_days": 1,
    },
    {
        "rule_type": RuleType.DEMURRAGE,
        "rate_type": RateType.PER_DAY,
        "rate_value": Decimal("2200.00"),
        "shipping_line": ShippingLine.LINE_D,
        "free_days": 1,
    },
    {
        "rule_type": RuleType.OTHER_CHARGE,
        "rate_type": RateType.FLAT,
        "rate_value": Decimal("5000.00"),
        "cargo_type": CargoType.HAZARDOUS,
    },
)


def _dt(day: int, hour: int, minute: int = 0, month: int = 11) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=UTC)


SHIPMENTS: tuple[dict[str, Any], ...] = (
    {
        "reference": "DEMO-2026-001",
        "port": "INNSA",
        "owner": "importer@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.GENERAL_CONTAINER,
        "container_size_ft": 40,
        "hs_code": "847130",
        "weight_kg": Decimal("18500.00"),
        "declared_value": Decimal("4500000.00"),
        "shipping_line": ShippingLine.LINE_A,
        "vessel_size_band": VesselSizeBand.LARGE,
        "expected_arrival_at": _dt(12, 6),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.SUBMITTED,
    },
    {
        "reference": "DEMO-2026-002",
        "port": "INMUN",
        "owner": "importer@portiq.demo",
        "direction": Direction.EXPORT,
        "cargo_type": CargoType.REEFER,
        "container_size_ft": 20,
        "hs_code": "080610",
        "weight_kg": Decimal("12000.00"),
        "declared_value": Decimal("2200000.00"),
        "shipping_line": ShippingLine.LINE_B,
        "vessel_size_band": VesselSizeBand.MEDIUM,
        "expected_arrival_at": _dt(15, 4, 30),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.SUBMITTED,
    },
    {
        "reference": "DEMO-2026-003",
        "port": "INNSA",
        "owner": "importer2@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.HAZARDOUS,
        "container_size_ft": 20,
        "hs_code": "290220",
        "weight_kg": Decimal("9000.00"),
        "declared_value": Decimal("1800000.00"),
        "shipping_line": ShippingLine.LINE_C,
        "vessel_size_band": VesselSizeBand.SMALL,
        "expected_arrival_at": _dt(18, 9, 15),
        "documentation_status": DocumentationStatus.INCOMPLETE,
        "status": ShipmentStatus.SUBMITTED,
    },
    {
        "reference": "DEMO-2026-004",
        "port": "INMUN",
        "owner": "importer2@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.OVERSIZED,
        "container_size_ft": 40,
        "hs_code": "847150",
        "weight_kg": Decimal("24000.00"),
        "declared_value": Decimal("7600000.00"),
        "shipping_line": ShippingLine.LINE_D,
        "vessel_size_band": VesselSizeBand.LARGE,
        "expected_arrival_at": _dt(21, 12),
        "documentation_status": DocumentationStatus.UNKNOWN,
        "status": ShipmentStatus.SUBMITTED,
    },
    {
        "reference": "DEMO-2026-005",
        "port": "INNSA",
        "owner": "importer@portiq.demo",
        "direction": Direction.EXPORT,
        "cargo_type": CargoType.GENERAL_CONTAINER,
        "container_size_ft": 20,
        "hs_code": "852872",
        "weight_kg": Decimal("15000.00"),
        "declared_value": Decimal("3100000.00"),
        "shipping_line": ShippingLine.OTHER,
        "vessel_size_band": VesselSizeBand.MEDIUM,
        "expected_arrival_at": _dt(25, 3),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.SUBMITTED,
    },
    {
        "reference": "DEMO-2026-006",
        "port": "INMUN",
        "owner": "importer@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.GENERAL_CONTAINER,
        "container_size_ft": 40,
        "hs_code": "020714",
        "weight_kg": Decimal("21000.00"),
        "declared_value": Decimal("5400000.00"),
        "shipping_line": ShippingLine.LINE_A,
        "vessel_size_band": VesselSizeBand.LARGE,
        "expected_arrival_at": _dt(28, 7, 45),
        "documentation_status": DocumentationStatus.INCOMPLETE,
        "status": ShipmentStatus.SUBMITTED,
    },
    {
        "reference": "DEMO-2026-007",
        "port": "INNSA",
        "owner": "importer2@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.REEFER,
        "container_size_ft": 40,
        "hs_code": "081010",
        "weight_kg": Decimal("13000.00"),
        "declared_value": Decimal("2900000.00"),
        "shipping_line": ShippingLine.LINE_B,
        "vessel_size_band": VesselSizeBand.MEDIUM,
        "expected_arrival_at": _dt(8, 5),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.ARRIVED,
        "actual_arrival_at": _dt(8, 6, 20),
    },
    {
        "reference": "DEMO-2026-008",
        "port": "INMUN",
        "owner": "importer@portiq.demo",
        "direction": Direction.EXPORT,
        "cargo_type": CargoType.GENERAL_CONTAINER,
        "container_size_ft": 20,
        "hs_code": "847330",
        "weight_kg": Decimal("8000.00"),
        "declared_value": Decimal("1500000.00"),
        "shipping_line": ShippingLine.LINE_C,
        "vessel_size_band": VesselSizeBand.SMALL,
        "expected_arrival_at": _dt(6, 8),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.ARRIVED,
        "actual_arrival_at": _dt(6, 9, 10),
    },
    {
        "reference": "DEMO-2026-009",
        "port": "INNSA",
        "owner": "importer2@portiq.demo",
        "direction": Direction.EXPORT,
        "cargo_type": CargoType.HAZARDOUS,
        "container_size_ft": 40,
        "hs_code": "290511",
        "weight_kg": Decimal("11000.00"),
        "declared_value": Decimal("2400000.00"),
        "shipping_line": ShippingLine.LINE_D,
        "vessel_size_band": VesselSizeBand.LARGE,
        "expected_arrival_at": _dt(4, 10),
        "documentation_status": DocumentationStatus.INCOMPLETE,
        "status": ShipmentStatus.ARRIVED,
        "actual_arrival_at": _dt(4, 11, 35),
    },
    {
        "reference": "DEMO-2026-010",
        "port": "INMUN",
        "owner": "importer@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.GENERAL_CONTAINER,
        "container_size_ft": 40,
        "hs_code": "850440",
        "weight_kg": Decimal("16000.00"),
        "declared_value": Decimal("3900000.00"),
        "shipping_line": ShippingLine.LINE_A,
        "vessel_size_band": VesselSizeBand.LARGE,
        "expected_arrival_at": _dt(28, 6, month=10),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.CLEARED,
        "actual_arrival_at": _dt(28, 7, 10, month=10),
        "actual_cleared_at": _dt(30, 11, 45, month=10),
    },
    {
        "reference": "DEMO-2026-011",
        "port": "INNSA",
        "owner": "importer2@portiq.demo",
        "direction": Direction.IMPORT,
        "cargo_type": CargoType.REEFER,
        "container_size_ft": 20,
        "hs_code": "080390",
        "weight_kg": Decimal("9500.00"),
        "declared_value": Decimal("2000000.00"),
        "shipping_line": ShippingLine.LINE_B,
        "vessel_size_band": VesselSizeBand.MEDIUM,
        "expected_arrival_at": _dt(25, 4, month=10),
        "documentation_status": DocumentationStatus.COMPLETE,
        "status": ShipmentStatus.CLEARED,
        "actual_arrival_at": _dt(25, 5, 5, month=10),
        "actual_cleared_at": _dt(27, 9, 30, month=10),
    },
    {
        "reference": "DEMO-2026-012",
        "port": "INMUN",
        "owner": "importer@portiq.demo",
        "direction": Direction.EXPORT,
        "cargo_type": CargoType.OVERSIZED,
        "container_size_ft": 40,
        "hs_code": "847989",
        "weight_kg": Decimal("26000.00"),
        "declared_value": Decimal("8200000.00"),
        "shipping_line": ShippingLine.OTHER,
        "vessel_size_band": VesselSizeBand.LARGE,
        "expected_arrival_at": _dt(20, 12, month=10),
        "documentation_status": DocumentationStatus.UNKNOWN,
        "status": ShipmentStatus.CLEARED,
        "actual_arrival_at": _dt(20, 13, 20, month=10),
        "actual_cleared_at": _dt(23, 15, 0, month=10),
    },
)


def _seed_id(label: str) -> UUID:
    return uuid5(SEED_NAMESPACE, f"portiq:dev-seed:{label}")


def _tariff_label(rule: dict[str, Any]) -> str:
    parts = [
        rule["rule_type"].value,
        rule.get("hs_code_prefix") or "-",
        getattr(rule.get("shipping_line"), "value", "-"),
        getattr(rule.get("cargo_type"), "value", "-"),
        str(rule.get("container_size_ft") or "-"),
        rule["rate_type"].value,
        str(rule["rate_value"]),
    ]
    return "tariff:" + ":".join(parts)


def _seat_ports(session: Session) -> dict[str, Port]:
    ports: dict[str, Port] = {}
    for row in PORTS:
        port = ports_repo.get_by_code(session, row["code"])
        if port is None:
            port = ports_repo.create(
                session,
                port_id=_seed_id(f"port:{row['code']}"),
                name=row["name"],
                port_code=row["code"],
                country=row["country"],
                timezone=row["timezone"],
            )
        ports[row["code"]] = port
    return ports


def _seat_users(session: Session, ports: dict[str, Port]) -> dict[str, Profile]:
    profiles: dict[str, Profile] = {}
    for row in USERS:
        profile = profiles_repo.get_by_email(session, row["email"])
        if profile is None:
            profile = profiles_repo.create(
                session,
                user_id=_seed_id(f"user:{row['email']}"),
                email=row["email"],
                display_name=row["display_name"],
                role=row["role"],
            )
        profiles[row["email"]] = profile
        assigned = set(operator_ports_repo.list_port_ids(session, profile.id))
        for port_code in row["ports"]:
            port_id = ports[port_code].id
            if port_id not in assigned:
                operator_ports_repo.assign(session, user_id=profile.id, port_id=port_id)
    return profiles


def _seat_tariffs(session: Session, admin_id: UUID) -> None:
    for rule in TARIFFS:
        rule_id = _seed_id(_tariff_label(rule))
        if tariffs_repo.get_by_id(session, rule_id) is not None:
            continue
        tariffs_repo.create(
            session,
            rule_id=rule_id,
            rule_type=rule["rule_type"],
            rate_type=rule["rate_type"],
            rate_value=rule["rate_value"],
            currency=Currency.INR,
            valid_from=VALID_FROM,
            source_note=DEMO_NOTE,
            version=DEMO_VERSION,
            hs_code_prefix=rule.get("hs_code_prefix"),
            shipping_line=rule.get("shipping_line"),
            cargo_type=rule.get("cargo_type"),
            container_size_ft=rule.get("container_size_ft"),
            free_days=rule.get("free_days"),
            tier_config=rule.get("tier_config"),
            created_by=admin_id,
        )


def _seat_shipments(session: Session, ports: dict[str, Port], profiles: dict[str, Profile]) -> None:
    operators = {
        "INNSA": profiles["operator2@portiq.demo"],
        "INMUN": profiles["operator@portiq.demo"],
    }
    now = datetime.now(UTC)

    for row in SHIPMENTS:
        shipment = shipments_repo.get_by_reference(session, row["reference"])
        if shipment is not None:
            continue
        owner = profiles[row["owner"]]
        shipment = shipments_repo.create(
            session,
            shipment_id=_seed_id(f"shipment:{row['reference']}"),
            owner_user_id=owner.id,
            port_id=ports[row["port"]].id,
            reference=row["reference"],
            direction=row["direction"],
            cargo_type=row["cargo_type"],
            container_size_ft=row["container_size_ft"],
            hs_code=row["hs_code"],
            weight_kg=row["weight_kg"],
            declared_value=row["declared_value"],
            currency=Currency.INR,
            shipping_line=row["shipping_line"],
            vessel_size_band=row["vessel_size_band"],
            expected_arrival_at=row["expected_arrival_at"],
            documentation_status=row["documentation_status"],
            status=row["status"],
            actual_arrival_at=row.get("actual_arrival_at"),
            actual_cleared_at=row.get("actual_cleared_at"),
        )

        # Created when the shipment was booked, never in the future (seeded rows only).
        created_at = min(row["expected_arrival_at"] - timedelta(days=2), now)
        shipments_repo.add_event(
            session,
            event_id=_seed_id(f"event:{row['reference']}:created"),
            shipment_id=shipment.id,
            actor_user_id=owner.id,
            event_type="created",
            from_status=None,
            to_status=ShipmentStatus.SUBMITTED,
            occurred_at=created_at,
        )
        if shipment.actual_arrival_at is not None:
            shipments_repo.add_event(
                session,
                event_id=_seed_id(f"event:{row['reference']}:arrived"),
                shipment_id=shipment.id,
                actor_user_id=operators[row["port"]].id,
                event_type="arrived",
                from_status=ShipmentStatus.SUBMITTED,
                to_status=ShipmentStatus.ARRIVED,
                occurred_at=shipment.actual_arrival_at,
            )
        if shipment.actual_cleared_at is not None:
            shipments_repo.add_event(
                session,
                event_id=_seed_id(f"event:{row['reference']}:cleared"),
                shipment_id=shipment.id,
                actor_user_id=operators[row["port"]].id,
                event_type="cleared",
                from_status=ShipmentStatus.ARRIVED,
                to_status=ShipmentStatus.CLEARED,
                occurred_at=shipment.actual_cleared_at,
            )


COUNTED_TABLES = (
    Profile,
    Port,
    OperatorPort,
    Shipment,
    ShipmentEvent,
    PredictionRun,
    CapacityForecast,
    TariffRule,
    AuditLog,
)


def row_counts(session: Session) -> dict[str, int]:
    """Row count per table, in table order, for the human check."""
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model)) or 0
        for model in COUNTED_TABLES
    }


def seed_demo(session: Session, *, app_env: str) -> dict[str, int]:
    """Insert the demo dataset. Safe to run repeatedly; never creates duplicates."""
    if app_env not in DEV_ENVIRONMENTS:
        raise RuntimeError(f"seed_dev is dev only; APP_ENV is {app_env!r}")
    ports = _seat_ports(session)
    profiles = _seat_users(session, ports)
    _seat_tariffs(session, admin_id=profiles["admin@portiq.demo"].id)
    _seat_shipments(session, ports, profiles)
    session.flush()
    return row_counts(session)


def run_seed() -> dict[str, int]:
    with session_scope() as session:
        return seed_demo(session, app_env=settings.app_env)


def main() -> int:
    if settings.app_env not in DEV_ENVIRONMENTS:
        print(
            f"refusing to seed: APP_ENV={settings.app_env!r} (dev only)",
            file=sys.stderr,
        )
        return 1
    counts = run_seed()
    print(json.dumps({"row_counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
