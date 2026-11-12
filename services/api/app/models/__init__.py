"""SQLAlchemy tables (backend spec section 6). Import this module to register metadata."""

from app.models.tables import (
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

__all__ = [
    "AuditLog",
    "CapacityForecast",
    "OperatorPort",
    "Port",
    "PredictionRun",
    "Profile",
    "Shipment",
    "ShipmentEvent",
    "TariffRule",
]
