"""Pydantic schemas for capacity forecast buckets."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.models import CapacityForecast
from app.schemas.enums import ResourceType, SourceType
from app.schemas.shipments import utc_z


class CapacityBucketResponse(BaseModel):
    bucket_start: str
    bucket_end: str
    resource_type: ResourceType
    predicted_occupied: float
    total_capacity: float
    utilization_pct: float
    source_type: SourceType
    model_or_rule_version: str
    generated_at: str


def bucket_payload(row: CapacityForecast) -> dict[str, Any]:
    """One stored bucket as the contract ``CapacityBucket``."""
    return CapacityBucketResponse(
        bucket_start=utc_z(row.bucket_start),
        bucket_end=utc_z(row.bucket_end),
        resource_type=row.resource_type,
        predicted_occupied=round(float(row.predicted_occupied), 2),
        total_capacity=round(float(row.total_capacity), 2),
        utilization_pct=round(float(row.utilization_pct), 2),
        source_type=row.source_type,
        model_or_rule_version=row.model_or_rule_version,
        generated_at=utc_z(row.generated_at),
    ).model_dump(mode="json")
