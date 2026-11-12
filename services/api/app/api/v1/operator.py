from typing import Annotated, Any
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func

from app.core.deps import DbSession, require_role
from app.core.errors import request_id_of
from app.models.tables import Profile, Shipment
from app.repositories import operator_ports as operator_ports_repo
from app.schemas.enums import Role, ShipmentStatus
from app.schemas.envelope import envelope

router = APIRouter(prefix="/operator", tags=["operator"])

Operator = Annotated[Profile, Depends(require_role(Role.PORT_OPERATOR))]

@router.get("/dashboard/summary")
def read_operator_summary(
    request: Request,
    session: DbSession,
    user: Operator
) -> dict[str, Any]:
    """Returns aggregated metrics for the ports assigned to this operator."""
    port_ids = operator_ports_repo.list_port_ids(session, user.id)
    
    # Query shipments arriving at these assigned ports
    counts = session.query(
        Shipment.status, func.count(Shipment.id)
    ).filter(
        Shipment.port_id.in_(port_ids)
    ).group_by(Shipment.status).all()
    
    status_counts = {status.value: 0 for status in ShipmentStatus}
    total = 0
    for status, count in counts:
        # Handle SQLAlchemy enum objects safely
        status_key = status.value if hasattr(status, 'value') else status
        status_counts[status_key] = count
        total += count
        
    return envelope({
        "total_incoming": total,
        "status_counts": status_counts,
        "assigned_ports": [str(pid) for pid in port_ids]
    }, request_id_of(request))