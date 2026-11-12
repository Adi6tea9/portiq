"""Pydantic schemas for capacity forecast buckets."""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.enums import ResourceType, SourceType


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