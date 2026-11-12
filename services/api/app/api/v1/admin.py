from fastapi.responses import   JSONResponse
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import Optional
from datetime import datetime
import uuid

from app.db import get_db
from app.core.deps import get_current_user, require_role
from app.schemas.admin import TariffRuleCreate, TariffRulePatch
from app.models.tables import TariffRule, AuditLog  # Adjust import based on your models file structure

router = APIRouter(prefix="/admin", tags=["admin"])

def create_audit_log(db: Session, actor_id: str, action: str, entity_type: str, entity_id: str, request_id: str, before: dict = None, after: dict = None):
    log = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        request_id=request_id,
        created_at=datetime.utcnow()
    )
    db.add(log)

@router.get("/tariffs")
def list_tariffs(
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("platform_admin")),
    rule_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    query = db.query(TariffRule)
    if rule_type:
        query = query.filter(TariffRule.rule_type == rule_type)
        
    total = query.count()
    items = query.order_by(TariffRule.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "data": items,
        "meta": {"pagination": {"page": page, "page_size": page_size, "total": total}}
    }

@router.post("/tariffs", status_code=201)
def create_tariff(
    request: Request,
    payload: TariffRuleCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("platform_admin"))
):
    # Base filter for exact scope matches
    conflict_query = db.query(TariffRule).filter(
        TariffRule.is_active == True,
        TariffRule.rule_type == payload.rule_type,
        TariffRule.port_id == payload.port_id,
        TariffRule.hs_code_prefix == payload.hs_code_prefix,
        TariffRule.shipping_line == payload.shipping_line,
        TariffRule.cargo_type == payload.cargo_type,
        TariffRule.container_size_ft == payload.container_size_ft
    )

    # Conditionally handle the date overlap logic to avoid comparing to None
    if payload.valid_to is None:
        conflict_query = conflict_query.filter(
            or_(
                TariffRule.valid_to == None,
                TariffRule.valid_to >= payload.valid_from
            )
        )
    else:
        conflict_query = conflict_query.filter(
            or_(
                TariffRule.valid_to == None,
                and_(
                    TariffRule.valid_from <= payload.valid_to,
                    TariffRule.valid_to >= payload.valid_from
                )
            )
        )

    conflict = conflict_query.first()

    if conflict:
       return JSONResponse(
            status_code=409, 
            content={
                "error": {
                    "code": "TARIFF_CONFLICT", 
                    "message": "Conflicting active rule exists", 
                    "details": [{"field": "rule", "issue": str(conflict.id)}],
                    "request_id": request.state.request_id
                }
            }
        )

    new_rule = TariffRule(
        id=str(uuid.uuid4()),
        **payload.model_dump(),
        version="1.0",
        is_active=True,
        created_by=user.id,
        created_at=datetime.utcnow()
    )
    db.add(new_rule)
    db.flush()

    create_audit_log(
        db=db, actor_id=user.id, action="create", entity_type="tariff_rule",
        entity_id=new_rule.id, request_id=request.state.request_id, before=None, after=payload.model_dump(mode='json')
    )
    
    db.commit()
    return {"data": new_rule}

@router.patch("/tariffs/{rule_id}")
def deactivate_tariff(
    request: Request,
    rule_id: str,
    payload: TariffRulePatch,
    db: Session = Depends(get_db),
    user = Depends(require_role("platform_admin"))
):
    rule = db.query(TariffRule).filter(TariffRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    before_state = {"is_active": rule.is_active}
    rule.is_active = False
    db.flush()

    create_audit_log(
        db=db, actor_id=user.id, action="deactivate", entity_type="tariff_rule", # FIXED
        entity_id=rule.id, request_id=request.state.request_id, before=before_state, after={"is_active": False}
    )
    
    db.commit()
    return {"data": rule}