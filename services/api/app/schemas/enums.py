"""Single source for every enum in the contract (frontend contract section 5.2).

Values are the exact strings the API returns; SQLAlchemy enum columns and Postgres
enum types are generated from these members, never from a second list.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

ContainerSizeFt = Literal[20, 40]
CONTAINER_SIZES_FT: tuple[int, ...] = (20, 40)


class Role(StrEnum):
    IMPORTER_EXPORTER = "importer_exporter"
    PORT_OPERATOR = "port_operator"
    PLATFORM_ADMIN = "platform_admin"


class Direction(StrEnum):
    IMPORT = "import"
    EXPORT = "export"


class CargoType(StrEnum):
    GENERAL_CONTAINER = "general_container"
    REEFER = "reefer"
    HAZARDOUS = "hazardous"
    OVERSIZED = "oversized"


class ShippingLine(StrEnum):
    LINE_A = "Line A"
    LINE_B = "Line B"
    LINE_C = "Line C"
    LINE_D = "Line D"
    OTHER = "other"


class VesselSizeBand(StrEnum):
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


class DocumentationStatus(StrEnum):
    COMPLETE = "complete"
    INCOMPLETE = "incomplete"
    UNKNOWN = "unknown"


class ShipmentStatus(StrEnum):
    SUBMITTED = "submitted"
    ARRIVED = "arrived"
    CLEARED = "cleared"


class ResourceType(StrEnum):
    YARD = "yard"
    BERTH = "berth"


class SourceType(StrEnum):
    SYNTHETIC = "synthetic"
    IMPORTED = "imported"


class Currency(StrEnum):
    INR = "INR"


class CostComponent(StrEnum):
    CUSTOMS_DUTY = "customs_duty"
    PORT_STORAGE = "port_storage"
    DEMURRAGE = "demurrage"
    OTHER_CHARGE = "other_charge"


class RuleType(StrEnum):
    CUSTOMS_DUTY = "customs_duty"
    PORT_STORAGE = "port_storage"
    DEMURRAGE = "demurrage"
    OTHER_CHARGE = "other_charge"


class RateType(StrEnum):
    PER_DAY = "per_day"
    PERCENT_OF_VALUE = "percent_of_value"
    FLAT = "flat"
    TIERED = "tiered"


class WarningCode(StrEnum):
    DEMO_DATA = "DEMO_DATA"
    CAPACITY_UNAVAILABLE = "CAPACITY_UNAVAILABLE"
    EXPLANATION_UNAVAILABLE = "EXPLANATION_UNAVAILABLE"
    TARIFF_MISSING = "TARIFF_MISSING"
    OUT_OF_RANGE_INPUT = "OUT_OF_RANGE_INPUT"


class AtRiskCode(StrEnum):
    FORECAST_THRESHOLD_CROSSED = "FORECAST_THRESHOLD_CROSSED"
    DWELL_ABOVE_THRESHOLD = "DWELL_ABOVE_THRESHOLD"
    DOCUMENTATION_INCOMPLETE = "DOCUMENTATION_INCOMPLETE"
