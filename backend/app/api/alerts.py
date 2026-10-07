from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Alert, AlertRule
from backend.app.schemas.api_schemas import AlertResponse, AlertRuleCreate, AlertRuleResponse
from backend.app.services.audit import log_audit_event

router = APIRouter(prefix="/alerts", tags=["Alerts & Notifications"])

@router.get("", response_model=List[AlertResponse])
async def list_alerts(
    resolved: Optional[bool] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Alert).order_by(Alert.created_at.desc())
    if resolved is not None:
        stmt = stmt.where(Alert.is_resolved == resolved)
    if severity and severity.upper() != "ALL":
        stmt = stmt.where(Alert.severity == severity.upper())

    result = await db.execute(stmt)
    alerts = result.scalars().all()
    return [AlertResponse.model_validate(a) for a in alerts]

@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN", "APPLICATION_ADMIN"]))
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.is_acknowledged = True
    await db.commit()
    return {"success": True, "alert_id": alert.id, "is_acknowledged": True}

@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN", "APPLICATION_ADMIN"]))
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.is_resolved = True
    alert.resolved_at = datetime.now(timezone.utc)

    await log_audit_event(
        db=db,
        action="RESOLVE_ALERT",
        entity_type="alert",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=alert.id,
        details={"message": alert.message},
        result="SUCCESS"
    )

    await db.commit()
    return {"success": True, "alert_id": alert.id, "is_resolved": True}

@router.get("/rules", response_model=List[AlertRuleResponse])
async def list_alert_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(AlertRule).order_by(AlertRule.name.asc()))
    rules = result.scalars().all()
    return [AlertRuleResponse.model_validate(r) for r in rules]

@router.post("/rules", response_model=AlertRuleResponse)
async def create_alert_rule(
    payload: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN"]))
):
    rule = AlertRule(
        name=payload.name,
        metric_name=payload.metric_name,
        condition=payload.condition,
        threshold=payload.threshold,
        severity=payload.severity,
        channel=payload.channel
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)

@router.delete("/rules/{rule_id}")
async def delete_alert_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN"]))
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found.")

    await log_audit_event(
        db=db,
        action="DELETE_ALERT_RULE",
        entity_type="alert_rule",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=rule.id,
        details={"name": rule.name, "metric": rule.metric_name},
        result="SUCCESS"
    )

    await db.delete(rule)
    await db.commit()
    return {"success": True, "message": f"Alert rule '{rule.name}' deleted successfully."}

@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: str,
    payload: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN"]))
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found.")

    rule.name = payload.name
    rule.metric_name = payload.metric_name
    rule.condition = payload.condition
    rule.threshold = payload.threshold
    rule.severity = payload.severity
    rule.channel = payload.channel

    await log_audit_event(
        db=db,
        action="UPDATE_ALERT_RULE",
        entity_type="alert_rule",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=rule.id,
        details={"name": rule.name, "metric": rule.metric_name, "threshold": rule.threshold},
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)

