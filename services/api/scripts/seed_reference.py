"""Idempotent port and demo tariff data needed by the live API."""

from app.db import session_scope
from scripts.seed_dev import _seat_ports, _seat_tariffs

if __name__ == "__main__":
    with session_scope() as session:
        _seat_ports(session)
        _seat_tariffs(session, admin_id=None)
