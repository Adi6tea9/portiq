"""SQLAlchemy tables (backend spec section 6). Import this module to register metadata."""

from app.models.tables import (
    AuditLog,
    CapacityForecast,
    CargoItem,
    OperatorPort,
    Port,
    PredictionRun,
    Profile,
    SharedContainer,
    Shipment,
    ShipmentEvent,
    TariffRule,
)

__all__ = [
    "AuditLog",
    "CapacityForecast",
    "CargoItem",
    "OperatorPort",
    "Port",
    "PredictionRun",
    "Profile",
    "SharedContainer",
    "Shipment",
    "ShipmentEvent",
    "TariffRule",
]
