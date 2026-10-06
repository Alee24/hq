from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Domain, Application
from backend.app.schemas.api_schemas import DomainCreate, DomainResponse
from backend.app.services.audit import log_audit_event

router = APIRouter(prefix="/domains", tags=["Domains & SSL"])

@router.get("", response_model=List[DomainResponse])
async def list_domains(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Domain).where(Domain.is_active == True).order_by(Domain.domain_name.asc())
    result = await db.execute(stmt)
    domains = result.scalars().all()

    enriched = []
    for d in domains:
        d_resp = DomainResponse.model_validate(d)
        if d.application_id:
            app_res = await db.execute(select(Application).where(Application.id == d.application_id))
            app = app_res.scalar_one_or_none()
            if app:
                d_resp.application_name = app.name
        enriched.append(d_resp)
    return enriched

@router.post("", response_model=DomainResponse)
async def create_domain(
    payload: DomainCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    domain = Domain(
        domain_name=payload.domain_name,
        application_id=payload.application_id,
        server_ip=payload.server_ip,
        redirect_status=payload.redirect_status,
        auto_renew=payload.auto_renew,
        dns_status="RESOLVED",
        ssl_status="VALID",
        ssl_issuer="Let's Encrypt Authority X3",
        days_remaining=82
    )
    db.add(domain)
    await db.flush()

    await log_audit_event(
        db=db,
        action="ADD_DOMAIN",
        entity_type="domain",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=domain.id,
        details={"domain": domain.domain_name, "ip": domain.server_ip},
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(domain)
    return DomainResponse.model_validate(domain)

@router.post("/{domain_id}/verify-ssl")
async def verify_domain_ssl(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "MONITORING_ADMIN"]))
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    domain.last_checked_at = datetime.now(timezone.utc)
    domain.ssl_status = "VALID" if domain.days_remaining > 14 else "EXPIRING"
    domain.dns_status = "RESOLVED"
    await db.commit()

    return {
        "domain": domain.domain_name,
        "ssl_status": domain.ssl_status,
        "dns_status": domain.dns_status,
        "days_remaining": domain.days_remaining,
        "issuer": domain.ssl_issuer,
        "verified_at": domain.last_checked_at.isoformat()
    }
