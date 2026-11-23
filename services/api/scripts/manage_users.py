"""Manage who can use PortIQ and in which role (importer, port operator, admin).

Run it where the API runs (it talks to the API's database directly), e.g. with Docker:

    docker exec -w /app api-api-1 python scripts/manage_users.py <command> ...

    list
    set-role ana@x.com port_operator --ports INNSA,INMUN --by admin@x.com
    set-role ben@x.com platform_admin --by admin@x.com
    set-role ana@x.com importer_exporter --by admin@x.com
    deactivate ana@x.com --by admin@x.com
    activate ana@x.com --by admin@x.com
    delete ana@x.com --by admin@x.com

A person appears here after they sign up in the app (or are invited from the Supabase dashboard)
and sign in once: that first sign-in creates an importer profile. Roles are never set through the
API, so nobody can promote themselves. Every change is written to the audit log, attributed to the
`--by` admin; `--by` may be left out only while no active admin exists (first-admin bootstrap).
"""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

if __package__ in (None, ""):
    # `python scripts/manage_users.py` must find `app`.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db import session_scope
from app.models import Port, Profile, Shipment
from app.models.tables import AuditLog, OperatorPort, PredictionRun, ShipmentEvent, TariffRule
from app.repositories import audit_logs as audit_logs_repo
from app.schemas.enums import Role


class UserAdminError(Exception):
    """A refused change, with a message meant for the person running the command."""


def _profile(session: Session, email: str) -> Profile:
    wanted = email.strip().lower()
    profile = session.scalar(select(Profile).where(func.lower(Profile.email) == wanted))
    if profile is None:
        raise UserAdminError(
            f"No user {email!r}. They must sign up in the app and sign in once first."
        )
    return profile


def _active_admin_count(session: Session) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(Profile)
            .where(Profile.role == Role.PLATFORM_ADMIN, Profile.is_active.is_(True))
        )
        or 0
    )


def _actor(session: Session, by: str | None, target: Profile) -> Profile:
    """The admin making the change; without one, only the first-admin bootstrap is allowed."""
    if by:
        actor = _profile(session, by)
        if actor.role is not Role.PLATFORM_ADMIN or not actor.is_active:
            raise UserAdminError(f"{by} is not an active platform admin.")
        return actor
    if _active_admin_count(session) == 0:
        return target  # bootstrap: recorded as a self-change
    raise UserAdminError("Pass --by <admin email>: changes are recorded against an admin.")


def _ports_of(session: Session, profile: Profile) -> list[str]:
    return sorted(
        session.scalars(
            select(Port.port_code)
            .join(OperatorPort, OperatorPort.port_id == Port.id)
            .where(OperatorPort.user_id == profile.id)
        )
    )


def _snapshot(session: Session, profile: Profile) -> dict[str, object]:
    return {
        "role": profile.role.value,
        "is_active": profile.is_active,
        "ports": _ports_of(session, profile),
    }


def _would_lose_last_admin(session: Session, profile: Profile) -> bool:
    return (
        profile.role is Role.PLATFORM_ADMIN
        and profile.is_active
        and _active_admin_count(session) <= 1
    )


def _audit(
    session: Session, actor: Profile, target: Profile, action: str, before: dict, after: dict | None
) -> None:
    audit_logs_repo.add(
        session,
        actor_user_id=actor.id,
        action=action,
        entity_type="profile",
        entity_id=target.id,
        before=before,
        after=after,
        request_id=f"cli-{uuid.uuid4()}",
    )


def list_users(session: Session) -> list[dict[str, object]]:
    profiles = session.scalars(select(Profile).order_by(Profile.role, Profile.email))
    return [{"email": p.email, **_snapshot(session, p)} for p in profiles]


def set_role(
    session: Session, email: str, role: Role, ports: list[str] | None, by: str | None = None
) -> dict[str, object]:
    """Set the role; port operators get exactly `ports`, everyone else gets none."""
    target = _profile(session, email)
    actor = _actor(session, by, target)
    if target.role is Role.PLATFORM_ADMIN and role is not Role.PLATFORM_ADMIN:
        if _would_lose_last_admin(session, target):
            raise UserAdminError("Refused: this is the last active admin. Promote another first.")

    port_ids: list[uuid.UUID] = []
    if role is Role.PORT_OPERATOR:
        if not ports:
            raise UserAdminError("A port operator needs --ports, e.g. --ports INNSA,INMUN.")
        for code in ports:
            port = session.scalar(select(Port).where(Port.port_code == code.strip().upper()))
            if port is None:
                raise UserAdminError(f"Unknown port code {code!r}.")
            port_ids.append(port.id)
    elif ports:
        raise UserAdminError("--ports only applies to the port_operator role.")

    before = _snapshot(session, target)
    target.role = role
    session.execute(delete(OperatorPort).where(OperatorPort.user_id == target.id))
    for port_id in dict.fromkeys(port_ids):
        session.add(OperatorPort(user_id=target.id, port_id=port_id))
    session.flush()
    after = _snapshot(session, target)
    _audit(session, actor, target, "profile.set_role", before, after)
    return after


def set_active(session: Session, email: str, active: bool, by: str | None = None) -> None:
    """Deactivated users get 403 on every API call; their data and history stay intact."""
    target = _profile(session, email)
    actor = _actor(session, by, target)
    if not active and _would_lose_last_admin(session, target):
        raise UserAdminError("Refused: this is the last active admin. Promote another first.")
    before = _snapshot(session, target)
    target.is_active = active
    session.flush()
    _audit(
        session,
        actor,
        target,
        "profile.activate" if active else "profile.deactivate",
        before,
        _snapshot(session, target),
    )


def delete_user(session: Session, email: str, by: str | None = None) -> None:
    """Hard delete, only for users with no history; otherwise deactivate them instead."""
    target = _profile(session, email)
    actor = _actor(session, by, target)
    if actor.id == target.id:
        raise UserAdminError("Refused: an admin cannot delete themselves.")
    if _would_lose_last_admin(session, target):
        raise UserAdminError("Refused: this is the last active admin.")
    history = {
        "shipments": select(func.count()).where(Shipment.owner_user_id == target.id),
        "events": select(func.count()).where(ShipmentEvent.actor_user_id == target.id),
        "predictions": select(func.count()).where(PredictionRun.requested_by == target.id),
        "tariff rules": select(func.count()).where(TariffRule.created_by == target.id),
        "audit entries": select(func.count()).where(AuditLog.actor_user_id == target.id),
    }
    owned = {name: int(session.scalar(query) or 0) for name, query in history.items()}
    owned = {name: count for name, count in owned.items() if count}
    if owned:
        detail = ", ".join(f"{count} {name}" for name, count in owned.items())
        raise UserAdminError(
            f"Refused: {email} has history ({detail}) that must keep its owner. "
            "Use `deactivate` instead."
        )
    before = _snapshot(session, target)
    session.execute(delete(OperatorPort).where(OperatorPort.user_id == target.id))
    _audit(session, actor, target, "profile.delete", {"email": target.email, **before}, None)
    session.delete(target)
    session.flush()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="show every user, role, status and ports")
    role = sub.add_parser("set-role", help="make a user an importer, port operator or admin")
    role.add_argument("email")
    role.add_argument("role", choices=[r.value for r in Role])
    role.add_argument("--ports", help="comma-separated port codes, port_operator only")
    for name, text in (
        ("deactivate", "block a user (403 everywhere); keeps their data"),
        ("activate", "unblock a user"),
        ("delete", "remove a user with no history"),
    ):
        command = sub.add_parser(name, help=text)
        command.add_argument("email")
    for name, command in sub.choices.items():
        if name != "list":
            command.add_argument("--by", help="email of the admin making the change")
    args = parser.parse_args(argv)

    try:
        with session_scope() as session:
            if args.command == "list":
                for user in list_users(session):
                    port_text = ",".join(user["ports"]) or "-"  # type: ignore[arg-type]
                    state = "active" if user["is_active"] else "DEACTIVATED"
                    print(f"{user['email']:40s} {user['role']:18s} {state:11s} ports: {port_text}")
            elif args.command == "set-role":
                ports = args.ports.split(",") if args.ports else None
                result = set_role(session, args.email, Role(args.role), ports, args.by)
                print(f"{args.email} is now {result['role']} (ports: {result['ports'] or '-'})")
            elif args.command in ("deactivate", "activate"):
                set_active(session, args.email, args.command == "activate", args.by)
                print(f"{args.email} {args.command}d")
            else:
                delete_user(session, args.email, args.by)
                print(f"{args.email} deleted.")
                print("Also remove them in Supabase (Authentication > Users), otherwise their")
                print("next sign-in creates a new importer profile.")
    except UserAdminError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
