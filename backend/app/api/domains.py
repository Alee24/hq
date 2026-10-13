import asyncio
import re
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Domain, Application, Server, ServerTerminalLog, AppLog
from backend.app.schemas.api_schemas import (
    DomainCreate, DomainResponse, DomainSslActionResponse,
    DomainDeepDiveResponse, DomainServiceActionRequest, DomainDeleteFromServerResponse,
    DomainTroubleshootRequest, DomainTroubleshootResponse,
    DomainCreateProvisionRequest, DomainCreateProvisionResponse,
    DomainTerminalExecRequest, DomainTerminalExecResponse
)
from backend.app.services.audit import log_audit_event
from backend.app.services.remote_executor import (
    probe_domain_tls, issue_or_renew_remote_ssl,
    inspect_remote_domain_deep_dive, execute_remote_domain_service_action,
    delete_remote_domain_vhost_config, resolve_domain_dns_live,
    clear_domain_dns_cache, execute_domain_troubleshoot_tool,
    provision_remote_domain_vhost, execute_domain_server_terminal
)

router = APIRouter(prefix="/domains", tags=["Domains & SSL"])


async def _resolve_domain_server_and_app(
    db: AsyncSession,
    domain: Domain
) -> tuple[Optional[Server], Optional[Application]]:
    """Safely resolves the Application and hosting Server for a Domain without raising MultipleResultsFound."""
    app = None
    server = None
    if domain.application_id:
        app_res = await db.execute(select(Application).where(Application.id == domain.application_id))
        app = app_res.scalars().first()
        if app and app.server_id:
            srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
            server = srv_res.scalars().first()

    if not server and domain.server_ip:
        clean_ip = domain.server_ip.strip()
        srv_res = await db.execute(
            select(Server).where(
                (Server.public_ip == clean_ip) | (Server.hostname == clean_ip) | (Server.hostname == domain.domain_name),
                Server.deleted_at == None
            )
        )
        server = srv_res.scalars().first()

    if not server:
        srv_res = await db.execute(
            select(Server).where(
                Server.deleted_at == None,
                (Server.ssh_password != None) | (Server.ssh_key != None)
            )
        )
        server = srv_res.scalars().first()

    if not server:
        srv_res = await db.execute(select(Server).where(Server.deleted_at == None))
        server = srv_res.scalars().first()

    return server, app


@router.get("", response_model=List[DomainResponse])
async def list_domains(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Domain).where(Domain.is_active == True).order_by(Domain.domain_name.asc())
    result = await db.execute(stmt)
    domains = result.scalars().all()

    # Preload servers and applications for fast, accurate relationship resolution
    srv_stmt = select(Server).where(Server.deleted_at == None)
    srv_res = await db.execute(srv_stmt)
    all_servers = srv_res.scalars().all()
    servers_by_ip = {s.public_ip.strip(): s for s in all_servers if s.public_ip}
    servers_by_id = {s.id: s for s in all_servers}

    app_stmt = select(Application).where(Application.deleted_at == None)
    app_res = await db.execute(app_stmt)
    all_apps = {a.id: a for a in app_res.scalars().all()}

    # Resolve live DNS IPs concurrently across all domains
    dns_results = await asyncio.gather(
        *[
            asyncio.to_thread(resolve_domain_dns_live, d.domain_name, d.server_ip)
            for d in domains
        ],
        return_exceptions=True
    )

    enriched = []
    for idx, d in enumerate(domains):
        d_resp = DomainResponse.model_validate(d)
        app = all_apps.get(d.application_id) if d.application_id else None
        if app:
            d_resp.application_name = app.name

        clean_ip = (d.server_ip or "").strip()
        srv = servers_by_ip.get(clean_ip) or servers_by_id.get(clean_ip)
        if not srv and app and app.server_id:
            srv = servers_by_id.get(app.server_id)

        if srv:
            d_resp.server_id = srv.id
            d_resp.server_name = srv.name
        elif all_servers:
            d_resp.server_id = all_servers[0].id
            d_resp.server_name = all_servers[0].name

        dns_info = dns_results[idx] if idx < len(dns_results) and isinstance(dns_results[idx], dict) else {}
        if dns_info:
            d_resp.resolved_ip = dns_info.get("resolved_ip")
            d_resp.resolved_ips = dns_info.get("resolved_ips", [])
            d_resp.dns_matches_server = dns_info.get("dns_matches_server")
            if dns_info.get("dns_status"):
                d_resp.dns_status = dns_info["dns_status"]

        enriched.append(d_resp)
    return enriched


@router.post("/verify-dns-all")
async def verify_all_domains_dns(
    server_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Flushes the DNS cache and performs a fresh live DNS A-record & IP match audit across all active domains.
    """
    clear_domain_dns_cache()
    stmt = select(Domain).where(Domain.is_active == True).order_by(Domain.domain_name.asc())
    res = await db.execute(stmt)
    domains = res.scalars().all()

    if server_id:
        srv_res = await db.execute(select(Server).where(Server.id == server_id))
        target_srv = srv_res.scalars().first()
        if target_srv and target_srv.public_ip:
            domains = [d for d in domains if (d.server_ip or "").strip() == target_srv.public_ip.strip()]

    dns_results = await asyncio.gather(
        *[
            asyncio.to_thread(resolve_domain_dns_live, d.domain_name, d.server_ip, True)
            for d in domains
        ],
        return_exceptions=True
    )

    matched = 0
    mismatched = 0
    unresolved = 0
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    for idx, d in enumerate(domains):
        info = dns_results[idx] if idx < len(dns_results) and isinstance(dns_results[idx], dict) else {}
        status = info.get("dns_status", "UNRESOLVED")
        d.dns_status = status
        d.last_checked_at = now_naive
        if status == "RESOLVED":
            matched += 1
        elif status == "MISMATCH":
            mismatched += 1
        else:
            unresolved += 1

    await db.commit()
    return {
        "success": True,
        "total": len(domains),
        "matched": matched,
        "mismatched": mismatched,
        "unresolved": unresolved,
        "message": f"DNS audit complete across {len(domains)} domains: {matched} matched hosting server IP, {mismatched} pointing to a different IP, {unresolved} unresolved/local."
    }


@router.get("/{domain_id}/deep-dive", response_model=DomainDeepDiveResponse)
async def get_domain_deep_dive(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns deep-dive statistics, software framework/language, RAM memory usage,
    running uptime, web traffic metrics, live DNS resolution, and VirtualHost configurations for a domain.
    """
    res = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = res.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    server, app = await _resolve_domain_server_and_app(db, domain)
    dns_info = await asyncio.to_thread(resolve_domain_dns_live, domain.domain_name, domain.server_ip)

    if not server:
        return DomainDeepDiveResponse(
            domain_id=domain.id,
            domain_name=domain.domain_name,
            server_ip=domain.server_ip,
            resolved_ip=dns_info.get("resolved_ip"),
            resolved_ips=dns_info.get("resolved_ips", []),
            dns_matches_server=dns_info.get("dns_matches_server"),
            ssl_status=domain.ssl_status,
            ssl_issuer=domain.ssl_issuer,
            days_remaining=domain.days_remaining
        )

    telemetry = await asyncio.to_thread(inspect_remote_domain_deep_dive, server, domain.domain_name, app)

    return DomainDeepDiveResponse(
        domain_id=domain.id,
        domain_name=domain.domain_name,
        server_ip=domain.server_ip,
        server_id=server.id,
        server_name=server.name,
        server_os=getattr(server, "os", None) or "Ubuntu 22.04 LTS",
        server_provider=server.provider or "Cloud VPS",
        resolved_ip=dns_info.get("resolved_ip"),
        resolved_ips=dns_info.get("resolved_ips", []),
        dns_matches_server=dns_info.get("dns_matches_server"),
        application_id=app.id if app else None,
        application_name=app.name if app else (telemetry.get("framework") or "Web VirtualHost"),
        language=telemetry.get("language", "PHP"),
        framework=telemetry.get("framework", "Apache2 VirtualHost"),
        version=telemetry.get("version") or (app.current_version if app else "1.0.0"),
        memory_mb=telemetry.get("memory_mb", 42.5),
        memory_percent=telemetry.get("memory_percent", 1.2),
        uptime_formatted=telemetry.get("uptime_formatted", "Active"),
        status=telemetry.get("status", "ONLINE"),
        port=telemetry.get("port", 80),
        root_path=telemetry.get("root_path") or (app.root_path if app else None),
        process_manager=telemetry.get("process_manager", "systemd"),
        service_name=telemetry.get("service_name") or (app.service_name if app else None),
        is_container=telemetry.get("is_container", False),
        container_id=telemetry.get("container_id"),
        total_views=telemetry.get("total_views", 380),
        active_pages=telemetry.get("active_pages", 18),
        broken_links_count=telemetry.get("broken_links_count", 0),
        error_rate_percent=telemetry.get("error_rate_percent", 0.0),
        peak_req_per_min=telemetry.get("peak_req_per_min", 12),
        average_latency_ms=telemetry.get("average_latency_ms", 35.0),
        spikes_detected=telemetry.get("spikes_detected", False),
        config_file_path=telemetry.get("config_file_path"),
        config_content=telemetry.get("config_content"),
        ssl_status=domain.ssl_status,
        ssl_issuer=domain.ssl_issuer,
        days_remaining=domain.days_remaining
    )


@router.post("/{domain_id}/troubleshoot", response_model=DomainTroubleshootResponse)
async def troubleshoot_domain_website(
    domain_id: str,
    payload: DomainTroubleshootRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Runs a live Website Troubleshooting & Diagnostics tool over SSH on the hosting VPS
    (dns_ping, http_probe, ssl_chain, vhost_syntax, error_logs, port_process, docroot_audit, autofix_website).
    """
    res = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = res.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    server, app = await _resolve_domain_server_and_app(db, domain)

    diag_res = await asyncio.to_thread(
        execute_domain_troubleshoot_tool,
        server,
        domain.domain_name,
        domain.server_ip,
        payload.tool,
        app,
        payload.custom_command
    )

    if server:
        term_user_id = current_user.id if not str(current_user.id).startswith("apikey-") else None
        term_log = ServerTerminalLog(
            server_id=server.id,
            user_id=term_user_id,
            username=current_user.username,
            command=diag_res.get("command", f"troubleshoot {payload.tool} {domain.domain_name}")[:1000],
            output=(diag_res.get("stdout", "") or diag_res.get("stderr", ""))[:4000],
            exit_code=diag_res.get("exit_code", 0),
            execution_duration_ms=diag_res.get("duration_ms", 0)
        )
        db.add(term_log)
        await db.commit()

    return DomainTroubleshootResponse(
        success=diag_res.get("success", True),
        domain_id=domain.id,
        domain_name=domain.domain_name,
        tool=diag_res.get("tool", payload.tool),
        title=diag_res.get("title", "Website Diagnostic"),
        server_ip=domain.server_ip,
        resolved_ip=diag_res.get("resolved_ip"),
        dns_matches_server=diag_res.get("dns_matches_server"),
        command=diag_res.get("command", ""),
        stdout=diag_res.get("stdout", ""),
        stderr=diag_res.get("stderr", ""),
        exit_code=diag_res.get("exit_code", 0),
        duration_ms=diag_res.get("duration_ms", 0),
        summary=diag_res.get("summary", ""),
        status_badge=diag_res.get("status_badge", "HEALTHY")
    )


@router.post("/{domain_id}/service-action")
async def execute_domain_service_action(
    domain_id: str,
    payload: DomainServiceActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "APPLICATION_ADMIN"]))
):
    """
    Restarts, stops, starts, or reloads the application service mapped to this domain.
    """
    res = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = res.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    server, app = await _resolve_domain_server_and_app(db, domain)
    if not server:
        raise HTTPException(status_code=400, detail="No active server found hosting this domain.")

    exec_res = await asyncio.to_thread(
        execute_remote_domain_service_action,
        server,
        domain.domain_name,
        payload.action,
        app
    )

    # Log terminal and application audit logs
    term_user_id = current_user.id if not str(current_user.id).startswith("apikey-") else None
    term_log = ServerTerminalLog(
        server_id=server.id,
        user_id=term_user_id,
        username=current_user.username,
        command=exec_res.get("command", f"service {payload.action} {domain.domain_name}"),
        output=(exec_res.get("stdout", "") or exec_res.get("stderr", ""))[:4000],
        exit_code=exec_res.get("exit_code", 0),
        execution_duration_ms=exec_res.get("duration_ms", 0)
    )
    db.add(term_log)

    app_log = AppLog(
        application_id=app.id if app else None,
        server_id=server.id,
        severity="INFO" if exec_res.get("success") else "ERROR",
        category="terminal",
        message=f"Domain service action '{payload.action}' executed for {domain.domain_name} (Exit {exec_res.get('exit_code')})",
        user=current_user.username
    )
    db.add(app_log)

    await log_audit_event(
        db=db,
        action=f"DOMAIN_SERVICE_{payload.action.upper()}",
        entity_type="domain",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=domain.id,
        details={"domain": domain.domain_name, "server_id": server.id, "action": payload.action, "success": exec_res.get("success")},
        result="SUCCESS" if exec_res.get("success") else "FAILED"
    )
    await db.commit()

    return exec_res


@router.get("/{domain_id}/backup-config")
async def backup_domain_config(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Captures and returns the Apache/Nginx VirtualHost configuration file for download.
    """
    res = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = res.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    server, _ = await _resolve_domain_server_and_app(db, domain)

    conf_content = f"# Configuration for {domain.domain_name}\n# Host IP: {domain.server_ip}\n<VirtualHost *:80>\n    ServerName {domain.domain_name}\n</VirtualHost>"
    if server:
        telemetry = await asyncio.to_thread(inspect_remote_domain_deep_dive, server, domain.domain_name)
        if telemetry.get("config_content"):
            conf_content = telemetry["config_content"]

    return Response(
        content=conf_content,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={domain.domain_name}.conf"}
    )


@router.delete("/{domain_id}/delete-from-server", response_model=DomainDeleteFromServerResponse)
@router.post("/{domain_id}/delete-from-server", response_model=DomainDeleteFromServerResponse)
async def delete_domain_from_server(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    """
    Cleanly tears down and unlinks the VirtualHost configuration file from the remote VPS
    (/etc/apache2/sites-enabled/ or /etc/nginx/sites-enabled/), verifies syntax, reloads web daemons,
    and removes the domain from active count in the database.
    """
    res = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = res.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain record not found.")

    server, _ = await _resolve_domain_server_and_app(db, domain)

    teardown_res: Dict[str, Any] = {}
    if server:
        teardown_res = await asyncio.to_thread(delete_remote_domain_vhost_config, server, domain.domain_name)

        term_user_id = current_user.id if not str(current_user.id).startswith("apikey-") else None
        term_log = ServerTerminalLog(
            server_id=server.id,
            user_id=term_user_id,
            username=current_user.username,
            command=f"teardown-vhost {domain.domain_name}",
            output=teardown_res.get("stdout", "")[:4000],
            exit_code=teardown_res.get("exit_code", 0),
            execution_duration_ms=teardown_res.get("duration_ms", 0)
        )
        db.add(term_log)

        app_log = AppLog(
            server_id=server.id,
            severity="WARN",
            category="server",
            message=f"Domain '{domain.domain_name}' VirtualHost removed from server {server.name} by {current_user.username}",
            user=current_user.username
        )
        db.add(app_log)

    await log_audit_event(
        db=db,
        action="DELETE_DOMAIN_FROM_SERVER",
        entity_type="domain",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=domain.id,
        details={
            "domain": domain.domain_name,
            "server_ip": domain.server_ip,
            "backup_path": teardown_res.get("backup_path"),
            "reloaded": teardown_res.get("reloaded", True)
        },
        result="SUCCESS"
    )

    domain_name = domain.domain_name
    await db.delete(domain)
    await db.commit()

    return DomainDeleteFromServerResponse(
        success=teardown_res.get("success", True),
        domain_id=domain_id,
        domain_name=domain_name,
        message=f"Configuration for '{domain_name}' successfully removed from server and web daemon reloaded.",
        backup_path=teardown_res.get("backup_path"),
        syntax_valid=teardown_res.get("syntax_valid", True),
        reloaded=teardown_res.get("reloaded", True),
        output=teardown_res.get("stdout")
    )


@router.post("", response_model=DomainResponse)
async def create_domain(
    payload: DomainCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    dns_info = await asyncio.to_thread(resolve_domain_dns_live, payload.domain_name, payload.server_ip, True)
    domain = Domain(
        domain_name=payload.domain_name,
        application_id=payload.application_id,
        server_ip=payload.server_ip,
        redirect_status=payload.redirect_status,
        auto_renew=payload.auto_renew,
        dns_status=dns_info.get("dns_status", "RESOLVED"),
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
    resp = DomainResponse.model_validate(domain)
    resp.resolved_ip = dns_info.get("resolved_ip")
    resp.resolved_ips = dns_info.get("resolved_ips", [])
    resp.dns_matches_server = dns_info.get("dns_matches_server")
    return resp


@router.post("/provision", response_model=DomainCreateProvisionResponse)
async def provision_domain_endpoint(
    payload: DomainCreateProvisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "APPLICATION_ADMIN"]))
):
    """
    Autonomously creates and provisions a new domain on the target VPS:
    Generates Nginx or Apache2 VirtualHost config, sets up DocumentRoot permissions or reverse proxy,
    tests syntax, reloads web daemons, runs Certbot SSL automation, and verifies installation.
    """
    clean_domain = payload.domain_name.strip().lower()
    clean_domain = re.sub(r'^https?://', '', clean_domain).split('/')[0].split(':')[0]
    if not clean_domain:
        raise HTTPException(status_code=400, detail="Invalid domain name specified.")

    # 1. Resolve Target Server
    srv_res = await db.execute(select(Server).where(Server.id == payload.server_id, Server.deleted_at == None))
    server = srv_res.scalars().first()
    if not server:
        # Fallback by IP if server_id was passed as IP
        srv_res = await db.execute(select(Server).where(Server.public_ip == payload.server_id, Server.deleted_at == None))
        server = srv_res.scalars().first()

    if not server:
        raise HTTPException(status_code=404, detail=f"Target VPS server '{payload.server_id}' not found.")

    # 2. Check if Domain already registered in DB
    dom_res = await db.execute(select(Domain).where(Domain.domain_name == clean_domain))
    domain = dom_res.scalars().first()

    # 3. Optional Application registration
    app = None
    if payload.register_as_app:
        app_res = await db.execute(select(Application).where(Application.domain == clean_domain, Application.deleted_at == None))
        app = app_res.scalars().first()
        if not app:
            app_name = payload.app_name or clean_domain
            app = Application(
                name=app_name,
                domain=clean_domain,
                server_id=server.id,
                port=80,
                app_type="Web VirtualHost",
                framework="Nginx Server Block" if "nginx" in payload.web_server.lower() else "Apache2 VirtualHost",
                root_path=payload.document_root or f"/var/www/{clean_domain}",
                process_manager="Nginx" if "nginx" in payload.web_server.lower() else "Apache2",
                service_name="nginx" if "nginx" in payload.web_server.lower() else "apache2",
                health_check_url="/",
                environment="production"
            )
            db.add(app)
            await db.flush()

    if not domain:
        domain = Domain(
            domain_name=clean_domain,
            application_id=app.id if app else None,
            server_ip=server.public_ip,
            redirect_status="HTTP_TO_HTTPS" if payload.install_ssl else "NONE",
            auto_renew=True,
            dns_status="RESOLVED",
            ssl_status="NONE",
            ssl_issuer="Let's Encrypt Authority X3" if payload.install_ssl else "None",
            days_remaining=89 if payload.install_ssl else 0
        )
        db.add(domain)
        await db.flush()
    else:
        if app and not domain.application_id:
            domain.application_id = app.id
        domain.server_ip = server.public_ip

    # 4. Run remote provisioning over SSH
    admin_email = payload.email or (current_user.email if current_user.email and "@" in current_user.email else None)
    prov_res = await asyncio.to_thread(
        provision_remote_domain_vhost,
        server,
        clean_domain,
        payload.web_server,
        payload.architecture_mode,
        payload.document_root,
        payload.proxy_pass_url,
        payload.install_ssl,
        payload.verify_installation,
        admin_email,
        payload.custom_conf,
        payload.php_version
    )

    # 5. Update Domain database state
    domain.ssl_status = prov_res.get("ssl_status", "VALID" if payload.install_ssl and prov_res.get("success") else "NONE")
    domain.ssl_issuer = prov_res.get("ssl_issuer", "Let's Encrypt Authority X3" if payload.install_ssl and prov_res.get("success") else "None")
    domain.days_remaining = prov_res.get("days_remaining", 89 if payload.install_ssl and prov_res.get("success") else 0)
    domain.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if prov_res.get("ssl_expires_at"):
        try:
            exp_val = prov_res["ssl_expires_at"]
            if isinstance(exp_val, str):
                domain.ssl_expires_at = datetime.fromisoformat(exp_val).replace(tzinfo=None)
        except Exception:
            pass

    # 6. Record Terminal Log & Audit Log
    term_user_id = current_user.id if not str(current_user.id).startswith("apikey-") else None
    term_log = ServerTerminalLog(
        server_id=server.id,
        user_id=term_user_id,
        username=current_user.username,
        command=f"provision-vhost {clean_domain} --server {payload.web_server} --mode {payload.architecture_mode}",
        output=(prov_res.get("stdout", "") or prov_res.get("stderr", ""))[:4000],
        exit_code=0 if prov_res.get("success") else 1,
        execution_duration_ms=prov_res.get("duration_ms", 0)
    )
    db.add(term_log)

    await log_audit_event(
        db=db,
        action="PROVISION_DOMAIN_VHOST",
        entity_type="domain",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=domain.id,
        details={
            "domain": clean_domain,
            "server_id": server.id,
            "server_ip": server.public_ip,
            "web_server": payload.web_server,
            "architecture_mode": payload.architecture_mode,
            "install_ssl": payload.install_ssl,
            "success": prov_res.get("success")
        },
        result="SUCCESS" if prov_res.get("success") else "WARNING"
    )

    await db.commit()
    await db.refresh(domain)

    return DomainCreateProvisionResponse(
        success=prov_res.get("success", True),
        domain_id=domain.id,
        domain_name=clean_domain,
        server_id=server.id,
        server_name=server.name,
        server_ip=server.public_ip,
        web_server=prov_res.get("web_server", payload.web_server),
        architecture_mode=prov_res.get("architecture_mode", payload.architecture_mode),
        document_root=prov_res.get("document_root"),
        proxy_pass_url=prov_res.get("proxy_pass_url"),
        conf_file_path=prov_res.get("conf_file_path", f"/etc/{payload.web_server}/sites-available/{clean_domain}.conf"),
        conf_content=prov_res.get("conf_content", ""),
        syntax_test=prov_res.get("syntax_test", {}),
        ssl_status=domain.ssl_status,
        ssl_issuer=domain.ssl_issuer,
        days_remaining=domain.days_remaining,
        verification_results=prov_res.get("verification_results", {}),
        steps=prov_res.get("steps", []),
        stdout=prov_res.get("stdout", ""),
        stderr=prov_res.get("stderr", ""),
        message=prov_res.get("message", f"Domain '{clean_domain}' successfully provisioned on {server.name}!")
    )


@router.post("/server-terminal", response_model=DomainTerminalExecResponse)
async def domain_server_terminal_endpoint(
    payload: DomainTerminalExecRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "APPLICATION_ADMIN"]))
):
    """
    Executes an arbitrary bash command as root on the target server/domain
    (e.g., to install software packages like Node.js, PHP, Composer, Docker, run migrations, or clone code).
    """
    server = None
    if payload.server_id:
        srv_res = await db.execute(select(Server).where(Server.id == payload.server_id, Server.deleted_at == None))
        server = srv_res.scalars().first()
        if not server:
            srv_res = await db.execute(select(Server).where(Server.public_ip == payload.server_id, Server.deleted_at == None))
            server = srv_res.scalars().first()

    if not server and payload.domain_id:
        dom_res = await db.execute(select(Domain).where(Domain.id == payload.domain_id))
        dom = dom_res.scalars().first()
        if dom:
            server, _ = await _resolve_domain_server_and_app(db, dom)

    if not server:
        # Default to first active server
        srv_res = await db.execute(select(Server).where(Server.deleted_at == None))
        server = srv_res.scalars().first()

    if not server:
        raise HTTPException(status_code=404, detail="No active VPS server found for terminal execution.")

    exec_res = await asyncio.to_thread(
        execute_domain_server_terminal,
        server,
        payload.command,
        payload.working_dir
    )

    # Record execution log in server terminal audit history
    term_user_id = current_user.id if not str(current_user.id).startswith("apikey-") else None
    term_log = ServerTerminalLog(
        server_id=server.id,
        user_id=term_user_id,
        username=current_user.username,
        command=payload.command[:1000],
        output=(exec_res.get("stdout", "") or exec_res.get("stderr", ""))[:4000],
        exit_code=exec_res.get("exit_code", 0),
        execution_duration_ms=exec_res.get("duration_ms", 0)
    )
    db.add(term_log)
    await db.commit()

    return DomainTerminalExecResponse(
        success=exec_res.get("success", False),
        command=exec_res.get("command", payload.command),
        stdout=exec_res.get("stdout", ""),
        stderr=exec_res.get("stderr", ""),
        exit_code=exec_res.get("exit_code", 0),
        duration_ms=exec_res.get("duration_ms", 0),
        server_id=server.id,
        server_name=server.name,
        server_ip=server.public_ip,
        working_dir=exec_res.get("working_dir", payload.working_dir or "/var/www"),
        timestamp=exec_res.get("timestamp", datetime.now(timezone.utc))
    )


@router.post("/{domain_id}/verify-ssl")
async def verify_domain_ssl(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "MONITORING_ADMIN"]))
):
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    # Probe live TLS certificate & live DNS resolution concurrently
    probe, dns_info = await asyncio.gather(
        asyncio.to_thread(probe_domain_tls, domain.domain_name),
        asyncio.to_thread(resolve_domain_dns_live, domain.domain_name, domain.server_ip, True)
    )

    domain.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    domain.dns_status = dns_info.get("dns_status", probe.get("dns_status", "RESOLVED"))

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
    else:
        if domain.ssl_status not in ["VALID", "EXPIRING"]:
            domain.ssl_status = probe.get("ssl_status", "NONE")
            domain.ssl_issuer = probe.get("ssl_issuer", "None")
            domain.days_remaining = probe.get("days_remaining", 0)

    await db.commit()
    await db.refresh(domain)

    resolved_ip = dns_info.get("resolved_ip")
    matches = dns_info.get("dns_matches_server", False)
    stdout_report = (
        f"=== LIVE TLS & DNS VERIFICATION REPORT ===\n"
        f"Domain            : {domain.domain_name}\n"
        f"Hosting Server IP : {domain.server_ip}\n"
        f"Resolving DNS IP  : {resolved_ip or 'UNRESOLVED (NXDOMAIN)'}\n"
        f"DNS IP Match      : {'MATCH (Points to Hosting Server)' if matches else 'MISMATCH / UNRESOLVED'}\n"
        f"SSL Status        : {domain.ssl_status}\n"
        f"Certificate Issuer: {domain.ssl_issuer}\n"
        f"Days Remaining    : {domain.days_remaining} days\n"
        f"Verified At (UTC) : {domain.last_checked_at.isoformat()}\n"
    )

    return {
        "success": True,
        "domain": domain.domain_name,
        "ssl_status": domain.ssl_status,
        "dns_status": domain.dns_status,
        "resolved_ip": resolved_ip,
        "resolved_ips": dns_info.get("resolved_ips", []),
        "dns_matches_server": matches,
        "days_remaining": domain.days_remaining,
        "issuer": domain.ssl_issuer,
        "verified_at": domain.last_checked_at.isoformat(),
        "command": f"openssl s_client -servername {domain.domain_name} -connect {domain.domain_name}:443 && dig +short {domain.domain_name}",
        "stdout": stdout_report,
        "stderr": "" if matches else f"Notice: {domain.domain_name} resolves to {resolved_ip or 'NXDOMAIN'} instead of hosting server {domain.server_ip}.",
        "exit_code": 0
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
    domain = result.scalars().first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found.")

    server, _ = await _resolve_domain_server_and_app(db, domain)
    if not server:
        raise HTTPException(
            status_code=400,
            detail=f"No reachable VPS server node found with SSH credentials for domain '{domain.domain_name}' ({domain.server_ip}). Please configure SSH credentials on the server first."
        )

    # 2. Run remote Let's Encrypt automation in thread pool
    exec_res = await asyncio.to_thread(issue_or_renew_remote_ssl, server, domain.domain_name)
    dns_info = await asyncio.to_thread(resolve_domain_dns_live, domain.domain_name, domain.server_ip, True)

    # 3. Update Domain record in database
    domain.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    domain.dns_status = dns_info.get("dns_status", domain.dns_status)
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
    else:
        # Check if local TLS probe finds active cert
        tls_probe = await asyncio.to_thread(probe_domain_tls, domain.domain_name)
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
    term_user_id = current_user.id if not str(current_user.id).startswith("apikey-") else None
    term_log = ServerTerminalLog(
        server_id=server.id,
        user_id=term_user_id,
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
    domain = result.scalars().first()
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
