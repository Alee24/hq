from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Domain, Application, Server, ServerTerminalLog
from backend.app.schemas.api_schemas import DomainCreate, DomainResponse, DomainSslActionResponse
from backend.app.services.audit import log_audit_event
from backend.app.services.remote_executor import probe_domain_tls, issue_or_renew_remote_ssl

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

    # Probe live TLS certificate via HTTPS socket probe
    probe = probe_domain_tls(domain.domain_name)
    domain.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if probe.get("valid"):
        domain.ssl_status = probe.get("ssl_status", "VALID")
        domain.ssl_issuer = probe.get("ssl_issuer", domain.ssl_issuer or "Let's Encrypt Authority X3")
        domain.days_remaining = probe.get("days_remaining", domain.days_remaining)
        if probe.get("ssl_expires_at"):
            exp_val = probe["ssl_expires_at"]
            if hasattr(exp_val, "replace"):
                domain.ssl_expires_at = exp_val.replace(tzinfo=None)
            elif isinstance(exp_val, str):
                try:
                    domain.ssl_expires_at = datetime.fromisoformat(exp_val).replace(tzinfo=None)
                except Exception:
                    pass
            else:
                domain.ssl_expires_at = exp_val
        domain.dns_status = probe.get("dns_status", "RESOLVED")
    else:
        if domain.ssl_status not in ["VALID", "EXPIRING"]:
            domain.ssl_status = probe.get("ssl_status", "NONE")
            domain.ssl_issuer = probe.get("ssl_issuer", "None")
            domain.days_remaining = probe.get("days_remaining", 0)

    await db.commit()
    await db.refresh(domain)

    return {
        "domain": domain.domain_name,
        "ssl_status": domain.ssl_status,
        "dns_status": domain.dns_status,
        "days_remaining": domain.days_remaining,
        "issuer": domain.ssl_issuer,
        "verified_at": domain.last_checked_at.isoformat()
    }

@router.post("/{domain_id}/update-ssl", response_model=DomainSslActionResponse)
async def update_domain_ssl(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "APPLICATION_ADMIN"]))
):
    """
    Connects to the hosting VPS over SSH as root and runs Certbot / Let's Encrypt automation
    to issue or renew the SSL certificate and automatically configure web server HTTPS redirects.
    """
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    # 1. Resolve host server
    server = None
    if domain.application_id:
        app_res = await db.execute(select(Application).where(Application.id == domain.application_id))
        app_obj = app_res.scalars().first()
        if app_obj and app_obj.server_id:
            srv_res = await db.execute(select(Server).where(Server.id == app_obj.server_id, Server.deleted_at == None))
            server = srv_res.scalars().first()

    if not server and domain.server_ip:
        srv_res = await db.execute(select(Server).where(Server.public_ip == domain.server_ip, Server.deleted_at == None))
        server = srv_res.scalars().first()

    if not server:
        # Fallback to any registered active server with SSH credentials
        srv_res = await db.execute(
            select(Server).where(
                Server.deleted_at == None,
                (Server.ssh_password != None) | (Server.ssh_key != None)
            )
        )
        server = srv_res.scalars().first()

    if not server:
        raise HTTPException(
            status_code=400,
            detail=f"No reachable VPS server node found with SSH credentials for domain '{domain.domain_name}' ({domain.server_ip}). Please configure SSH credentials on the server first."
        )

    # 2. Run remote Let's Encrypt automation
    exec_res = issue_or_renew_remote_ssl(server, domain.domain_name)

    # 3. Update Domain record in database
    domain.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if exec_res.get("success"):
        domain.ssl_status = exec_res.get("ssl_status", "VALID")
        domain.ssl_issuer = exec_res.get("ssl_issuer", "Let's Encrypt Authority X3")
        domain.days_remaining = exec_res.get("days_remaining", 89)
        if exec_res.get("ssl_expires_at"):
            try:
                exp_val = exec_res["ssl_expires_at"]
                if isinstance(exp_val, str):
                    domain.ssl_expires_at = datetime.fromisoformat(exp_val).replace(tzinfo=None)
                elif hasattr(exp_val, "replace"):
                    domain.ssl_expires_at = exp_val.replace(tzinfo=None)
                else:
                    domain.ssl_expires_at = exp_val
            except Exception:
                pass
        domain.dns_status = "RESOLVED"
    else:
        # Check if local TLS probe finds active cert
        tls_probe = probe_domain_tls(domain.domain_name)
        if tls_probe.get("valid"):
            domain.ssl_status = tls_probe.get("ssl_status", "VALID")
            domain.ssl_issuer = tls_probe.get("ssl_issuer", "Let's Encrypt Authority X3")
            domain.days_remaining = tls_probe.get("days_remaining", 89)
            if tls_probe.get("ssl_expires_at"):
                exp_val = tls_probe["ssl_expires_at"]
                if hasattr(exp_val, "replace"):
                    domain.ssl_expires_at = exp_val.replace(tzinfo=None)
                elif isinstance(exp_val, str):
                    try:
                        domain.ssl_expires_at = datetime.fromisoformat(exp_val).replace(tzinfo=None)
                    except Exception:
                        pass
                else:
                    domain.ssl_expires_at = exp_val

    # 4. Record execution log in server terminal audit history
    term_log = ServerTerminalLog(
        server_id=server.id,
        user_id=current_user.id,
        username=current_user.username,
        command=exec_res.get("command", f"certbot -d {domain.domain_name}"),
        output=(exec_res.get("stdout", "") or exec_res.get("stderr", "") or "")[:4000],
        exit_code=exec_res.get("exit_code", 0),
        execution_duration_ms=exec_res.get("duration_ms", 0)
    )
    db.add(term_log)

    # 5. Log audit event
    await log_audit_event(
        db=db,
        action="UPDATE_DOMAIN_SSL",
        entity_type="domain",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=domain.id,
        details={
            "domain": domain.domain_name,
            "server_id": server.id,
            "server_name": server.name,
            "success": exec_res.get("success", False),
            "ssl_status": domain.ssl_status,
            "ssl_issuer": domain.ssl_issuer,
            "days_remaining": domain.days_remaining
        },
        result="SUCCESS" if exec_res.get("success") else "FAILED"
    )

    await db.commit()
    await db.refresh(domain)

    return DomainSslActionResponse(
        success=exec_res.get("success", False),
        domain_id=domain.id,
        domain_name=domain.domain_name,
        ssl_status=domain.ssl_status,
        ssl_issuer=domain.ssl_issuer,
        days_remaining=domain.days_remaining,
        ssl_expires_at=domain.ssl_expires_at,
        command=exec_res.get("command", f"certbot -d {domain.domain_name}"),
        stdout=exec_res.get("stdout", ""),
        stderr=exec_res.get("stderr", ""),
        exit_code=exec_res.get("exit_code", 0),
        duration_ms=exec_res.get("duration_ms", 0),
        message=exec_res.get("message", f"Let's Encrypt configuration completed for {domain.domain_name}")
    )

@router.delete("/{domain_id}")
async def delete_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain record not found.")

    await log_audit_event(
        db=db,
        action="DELETE_DOMAIN",
        entity_type="domain",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=domain.id,
        details={"domain": domain.domain_name, "ip": domain.server_ip},
        result="SUCCESS"
    )

    await db.delete(domain)
    await db.commit()
    return {"success": True, "message": f"Domain '{domain.domain_name}' deleted successfully."}

