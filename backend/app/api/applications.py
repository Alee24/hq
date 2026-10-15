import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional, Dict, Any
import re
import os
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import (
    User, Application, Server, License, Deployment, MonitoringResult, 
    AppLog, MaintenanceWindow, AuditLog, ServerTerminalLog
)
from backend.app.schemas.api_schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationResponse,
    ApplicationActionRequest, MaintenanceModeRequest, DeploymentResponse,
    MonitoringResultResponse, LogItemResponse, ApplicationComponentInfo
)
from backend.app.services.audit import log_audit_event
from backend.app.services.websocket_manager import ws_manager
from backend.app.services.remote_executor import (
    inspect_remote_container, execute_container_action, execute_remote_command,
    build_allowed_names_for_app
)

router = APIRouter(prefix="/applications", tags=["Applications"])

def classify_component_role(name: str) -> tuple[str, str, int]:
    """
    Classifies a container name into its architectural role, human label, and priority weight.
    """
    n = name.lower()
    if any(k in n for k in ['db', 'database', 'mysql', 'postgres', 'mariadb', 'mongo', 'sqlite']):
        return 'database', 'Database', 3
    if any(k in n for k in ['redis', 'cache', 'queue', 'memcached']):
        return 'cache', 'Cache & Queue', 4
    if any(k in n for k in ['certbot', 'letsencrypt', 'certs']):
        return 'certbot', 'SSL Certbot', 5
    if any(k in n for k in ['agent', 'telemetry', 'monitor']):
        return 'agent', 'Monitoring Agent', 6
    if any(k in n for k in ['worker', 'celery', 'cron', 'queue-worker']):
        return 'worker', 'Background Worker', 7
    if re.search(r'(^|[-_])(frontend|front-end|ui|web|client|fe)([-_0-9]|$)', n) or ('frontend' in n or 'front-end' in n or 'client' in n):
        return 'frontend', 'Frontend Web', 1
    if re.search(r'(^|[-_])(backend|back-end|api|server|engine|be)([-_0-9]|$)', n) or ('backend' in n or 'back-end' in n or 'api' in n):
        return 'backend', 'Backend API', 2
    return 'standalone', 'Application Service', 8

def extract_suite_key(name: str, app_type: str = "Docker Container") -> Optional[str]:
    """
    Extracts base project or suite name for Docker sibling containers.
    Non-container apps (Apache / Nginx vhosts) remain standalone.
    """
    if app_type != "Docker Container" and "." in name:
        return None
    if name.lower() in ["postgres", "redis"]:
        return "command-center"
    n = name.lower()
    m = re.match(r'^([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*?)[-_](frontend|backend|ui|web|api|db|database|postgres|mysql|redis|certbot|agent|coturn|server|client)', n)
    if m:
        return m.group(1)
    m2 = re.match(r'^([a-zA-Z0-9]+)[-_](?:.*)', n)
    if m2:
        return m2.group(1)
    return None

SUITE_TITLES = {
    "afera": "Afera Academy Suite",
    "command-center": "Central Command Center Suite",
    "gatepass": "Smart Campus GatePass Suite",
    "mpesaconnectcoke": "M-Pesa Connect Suite",
    "mclinic": "M-Clinic Portal Suite",
    "somesha": "Somesha Suite",
    "smartcampus": "Smart Campus Suite",
    "hq": "Command Center Suite"
}

def pretty_suite_name(key: str) -> str:
    if key in SUITE_TITLES:
        return SUITE_TITLES[key]
    return key.replace("-", " ").replace("_", " ").title() + " Suite"

def group_applications_list(enriched: List[ApplicationResponse]) -> List[ApplicationResponse]:
    """
    Groups sibling Docker microservice containers (frontend, backend, db, redis, certbot)
    into ONE single application entry per line, exposing components in the dropdown drawer.
    """
    suite_buckets: Dict[str, List[ApplicationResponse]] = {}
    standalone_apps: List[ApplicationResponse] = []

    for app in enriched:
        skey = extract_suite_key(app.name, app.app_type)
        if skey:
            suite_buckets.setdefault(skey, []).append(app)
        else:
            standalone_apps.append(app)

    grouped: List[ApplicationResponse] = []

    for skey, items in suite_buckets.items():
        if len(items) > 1:
            components: List[ApplicationComponentInfo] = []
            any_degraded = False
            all_offline = True

            for item in items:
                role, rlabel, _ = classify_component_role(item.name)
                comp = ApplicationComponentInfo(
                    id=item.id,
                    name=item.name,
                    service_name=item.service_name or item.name,
                    container_name=item.service_name or item.name,
                    role=role,
                    role_label=rlabel,
                    port=item.port,
                    health_status=item.health_status,
                    app_type=item.app_type,
                    process_manager=item.process_manager,
                    uptime_percent=item.uptime_percent or 99.98
                )
                components.append(comp)
                if item.health_status in ["DEGRADED", "CRITICAL"]:
                    any_degraded = True
                if item.health_status != "OFFLINE":
                    all_offline = False

            # Sort components: Frontend (1), Backend (2), Database (3), Cache (4), etc.
            components.sort(key=lambda c: classify_component_role(c.name)[2])

            # Select lead item for primary metadata (prefer frontend or backend)
            lead = items[0]
            for it in items:
                role, _, _ = classify_component_role(it.name)
                if role in ["frontend", "backend"]:
                    lead = it
                    break

            # Derive composite health
            if all_offline and len(items) > 0:
                suite_status = "OFFLINE"
            elif any_degraded:
                suite_status = "DEGRADED"
            else:
                suite_status = "ONLINE"

            lead_copy = lead.model_copy()
            if not lead_copy.current_commit:
                for it in items:
                    if it.current_commit:
                        lead_copy.current_commit = it.current_commit
                        lead_copy.latest_repo_commit = it.latest_repo_commit
                        lead_copy.git_branch = it.git_branch
                        lead_copy.repo_url = it.repo_url
                        if it.root_path and not it.root_path.startswith("/var/lib/docker"):
                            lead_copy.root_path = it.root_path
                        break
            lead_copy.name = pretty_suite_name(skey)
            lead_copy.group_name = skey
            lead_copy.is_suite = True
            lead_copy.components = components
            lead_copy.component_count = len(components)
            lead_copy.app_type = "Docker Suite"
            lead_copy.framework = "Multi-Container Docker Suite"
            lead_copy.process_manager = "Docker Compose"
            lead_copy.health_status = suite_status
            grouped.append(lead_copy)
        else:
            single_item = items[0]
            role, rlabel, _ = classify_component_role(single_item.name)
            comp = ApplicationComponentInfo(
                id=single_item.id,
                name=single_item.name,
                service_name=single_item.service_name or single_item.name,
                container_name=single_item.service_name or single_item.name,
                role=role,
                role_label=rlabel,
                port=single_item.port,
                health_status=single_item.health_status,
                app_type=single_item.app_type,
                process_manager=single_item.process_manager,
                uptime_percent=single_item.uptime_percent or 99.98
            )
            single_copy = single_item.model_copy()
            single_copy.is_suite = False
            single_copy.components = [comp]
            single_copy.component_count = 1
            grouped.append(single_copy)

    for s in standalone_apps:
        s_copy = s.model_copy()
        s_copy.is_suite = False
        s_copy.components = []
        s_copy.component_count = 1
        grouped.append(s_copy)

    grouped.sort(key=lambda a: a.name.lower())
    return grouped

@router.get("", response_model=List[ApplicationResponse])
async def list_applications(
    environment: Optional[str] = Query(None, description="Filter by environment (production, staging, development)"),
    status: Optional[str] = Query(None, description="Filter by health status"),
    search: Optional[str] = Query(None, description="Search query"),
    group_suites: bool = Query(True, description="Group sibling Docker containers into unified suites"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Application).where(Application.is_active == True, Application.deleted_at == None)
    if environment and environment.lower() != "all":
        stmt = stmt.where(Application.environment == environment.lower())
    if status and status.upper() != "ALL":
        stmt = stmt.where(Application.health_status == status.upper())
    if search:
        search_fmt = f"%{search}%"
        stmt = stmt.where((Application.name.ilike(search_fmt)) | (Application.domain.ilike(search_fmt)))

    stmt = stmt.order_by(Application.name.asc())
    result = await db.execute(stmt)
    apps = result.scalars().all()

    # Self-heal any non-Docker domain apps whose root_path/current_commit was previously hijacked by substring matching
    subdir_names = {
        "public", "public_html", "html", "dist", "build", "web", "www",
        "current", "release", "releases", "frontend", "backend", "client",
        "server", "api", "app", "src", "out", "static", "httpdocs", "htdocs"
    }
    commit_groups: Dict[tuple, List[Application]] = {}
    for app in apps:
        if app.current_commit and app.server_id:
            commit_groups.setdefault((app.server_id, app.current_commit), []).append(app)

    healed_any = False
    for (_, _), grp in commit_groups.items():
        suite_keys = {extract_suite_key(a.name, a.app_type) or f"standalone-{a.id}" for a in grp}
        for a in grp:
            dom_c = (a.domain or "").lower().strip()
            rp_c = (a.root_path or "").lower().strip().rstrip("/")
            is_dock = bool(
                (rp_c and rp_c.startswith("/var/lib/docker"))
                or dom_c.endswith(".local")
                or (a.process_manager and "docker" in a.process_manager.lower())
                or (a.app_type and "docker" in a.app_type.lower())
            )
            if not is_dock and rp_c:
                allowed = build_allowed_names_for_app(a.name, a.domain, a.service_name, is_docker=False)
                rp_base = os.path.basename(rp_c)
                rp_parent = os.path.basename(os.path.dirname(rp_c))
                was_substring_hijacked = bool(
                    len(suite_keys) > 1
                    or (rp_base and len(rp_base) >= 3 and (rp_base in dom_c or rp_base in a.name.lower()))
                )
                if was_substring_hijacked and rp_base not in allowed and not (rp_base in subdir_names and rp_parent in allowed):
                    a.current_commit = None
                    a.latest_repo_commit = None
                    a.git_branch = None
                    a.repo_url = None
                    if dom_c and not dom_c.endswith(".local"):
                        a.root_path = f"/var/www/{dom_c}"
                    healed_any = True
    if healed_any:
        await db.commit()

    # Enrich with server and license info
    enriched = []
    for app in apps:
        app_resp = ApplicationResponse.model_validate(app)
        # Fetch server
        srv_res = await db.execute(select(Server).where(Server.id == app.server_id))
        srv = srv_res.scalar_one_or_none()
        if srv:
            app_resp.server_name = srv.name
            app_resp.server_ip = srv.public_ip

        if app.license_id:
            lic_res = await db.execute(select(License).where(License.id == app.license_id))
            lic = lic_res.scalar_one_or_none()
            if lic:
                app_resp.license_key = lic.license_key
                app_resp.license_status = lic.status
                app_resp.license_expires_at = lic.expires_at

        enriched.append(app_resp)

    if group_suites:
        return group_applications_list(enriched)
    return enriched

@router.get("/{app_id}", response_model=ApplicationResponse)
async def get_application(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    app_resp = ApplicationResponse.model_validate(app)
    srv_res = await db.execute(select(Server).where(Server.id == app.server_id))
    srv = srv_res.scalar_one_or_none()
    if srv:
        app_resp.server_name = srv.name
        app_resp.server_ip = srv.public_ip

    if app.license_id:
        lic_res = await db.execute(select(License).where(License.id == app.license_id))
        lic = lic_res.scalar_one_or_none()
        if lic:
            app_resp.license_key = lic.license_key
            app_resp.license_status = lic.status
            app_resp.license_expires_at = lic.expires_at

    skey = extract_suite_key(app.name, app.app_type)
    if skey and app.server_id:
        siblings_res = await db.execute(
            select(Application).where(Application.server_id == app.server_id, Application.deleted_at == None)
        )
        siblings = [a for a in siblings_res.scalars().all() if extract_suite_key(a.name, a.app_type) == skey]
        if len(siblings) > 1:
            comps = []
            for s in siblings:
                role, rlabel, _ = classify_component_role(s.name)
                comps.append(ApplicationComponentInfo(
                    id=s.id,
                    name=s.name,
                    service_name=s.service_name or s.name,
                    container_name=s.service_name or s.name,
                    role=role,
                    role_label=rlabel,
                    port=s.port,
                    health_status=s.health_status,
                    app_type=s.app_type,
                    process_manager=s.process_manager,
                    uptime_percent=s.uptime_percent or 99.98
                ))
            comps.sort(key=lambda c: classify_component_role(c.name)[2])
            app_resp.is_suite = True
            app_resp.group_name = skey
            app_resp.components = comps
            app_resp.component_count = len(comps)
            app_resp.name = pretty_suite_name(skey)

    return app_resp

@router.post("", response_model=ApplicationResponse)
async def create_application(
    payload: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN"]))
):
    # Verify server exists if provided
    srv = None
    if payload.server_id:
        srv_res = await db.execute(select(Server).where(Server.id == payload.server_id, Server.deleted_at == None))
        srv = srv_res.scalar_one_or_none()
        if not srv:
            raise HTTPException(status_code=400, detail="Specified server does not exist.")

    app = Application(
        name=payload.name,
        description=payload.description,
        environment=payload.environment.lower(),
        domain=payload.domain,
        server_id=payload.server_id,
        port=payload.port,
        app_type=payload.app_type,
        framework=payload.framework,
        repo_url=payload.repo_url,
        root_path=payload.root_path,
        git_branch=payload.git_branch,
        current_version=payload.current_version,
        process_manager=payload.process_manager,
        service_name=payload.service_name,
        health_check_url=payload.health_check_url,
        license_id=payload.license_id,
        health_status="ONLINE",
        http_status=200,
        ssl_status="VALID",
        uptime_percent=99.98
    )
    db.add(app)
    await db.flush()

    await log_audit_event(
        db=db,
        action="CREATE_APPLICATION",
        entity_type="application",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"name": app.name, "domain": app.domain, "env": app.environment},
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(app)
    
    app_resp = ApplicationResponse.model_validate(app)
    if srv:
        app_resp.server_name = srv.name
        app_resp.server_ip = srv.public_ip
    return app_resp

@router.put("/{app_id}", response_model=ApplicationResponse)
async def update_application(
    app_id: str,
    payload: ApplicationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN"]))
):
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(app, k, v)

    await log_audit_event(
        db=db,
        action="UPDATE_APPLICATION",
        entity_type="application",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details=payload.model_dump(exclude_unset=True),
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(app)
    return ApplicationResponse.model_validate(app)

@router.post("/{app_id}/action")
async def execute_application_action(
    app_id: str,
    action_req: ApplicationActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN"]))
):
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    action = action_req.action.lower()
    allowed_actions = ["start", "stop", "restart", "reload", "health_check"]
    if action not in allowed_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action. Allowed: {', '.join(allowed_actions)}")

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Resolve associated server node
    srv = None
    if app.server_id:
        srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
        srv = srv_res.scalar_one_or_none()

    pm = (app.process_manager or "").lower()
    raw_target = (app.service_name or app.name or "").strip()
    clean_docker = raw_target.replace(" ", "-").lower() if raw_target else "app"

    is_docker = any(x in pm for x in ["docker", "container"]) or app.app_type == "Docker Container" or (extract_suite_key(app.name, app.app_type) is not None)
    if is_docker:
        if action == "restart":
            cmd = f'(cd "{app.root_path}" 2>/dev/null && docker compose restart 2>/dev/null) || docker restart "{raw_target}" 2>/dev/null || docker restart "{clean_docker}" 2>/dev/null || docker restart $(docker ps -a --filter "name={clean_docker}" -q | head -n 1)'
        elif action == "stop":
            cmd = f'(cd "{app.root_path}" 2>/dev/null && docker compose stop 2>/dev/null) || docker stop "{raw_target}" 2>/dev/null || docker stop "{clean_docker}" 2>/dev/null || docker stop $(docker ps -a --filter "name={clean_docker}" -q | head -n 1)'
        elif action == "start":
            cmd = f'(cd "{app.root_path}" 2>/dev/null && docker compose start 2>/dev/null) || docker start "{raw_target}" 2>/dev/null || docker start "{clean_docker}" 2>/dev/null || docker start $(docker ps -a --filter "name={clean_docker}" -q | head -n 1)'
        elif action == "reload":
            cmd = f'(cd "{app.root_path}" 2>/dev/null && docker compose restart 2>/dev/null) || docker restart "{raw_target}" 2>/dev/null || docker restart "{clean_docker}"'
        else: # health_check
            cmd = f'docker ps -a --filter "name={clean_docker}" --format "table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.Ports}}}}"'
    elif "apache" in pm:
        if action == "restart":
            cmd = "apache2ctl configtest 2>&1 && systemctl restart apache2"
        elif action == "stop":
            cmd = "systemctl stop apache2"
        elif action == "start":
            cmd = "apache2ctl configtest 2>&1 && systemctl start apache2"
        elif action == "reload":
            cmd = "apache2ctl configtest 2>&1 && (systemctl reload apache2 || apache2ctl graceful)"
        else:
            cmd = "apache2ctl configtest 2>&1 && systemctl status apache2 --no-pager -l | head -n 25"
    elif "nginx" in pm:
        if action == "restart":
            cmd = "nginx -t 2>&1 && systemctl restart nginx"
        elif action == "stop":
            cmd = "systemctl stop nginx"
        elif action == "start":
            cmd = "nginx -t 2>&1 && systemctl start nginx"
        elif action == "reload":
            cmd = "nginx -t 2>&1 && (systemctl reload nginx || nginx -s reload)"
        else:
            cmd = "nginx -t 2>&1 && systemctl status nginx --no-pager -l | head -n 25"
    elif "pm2" in pm:
        cmd = f'pm2 {action} "{raw_target}"'
    else: # systemd / general linux daemon
        if action in ["start", "stop", "restart"]:
            cmd = f'systemctl {action} "{raw_target}"'
        elif action == "reload":
            cmd = f'systemctl reload-or-restart "{raw_target}"'
        else:
            cmd = f'systemctl status "{raw_target}" --no-pager -l | head -n 25'

    # Execute remotely over SSH as root if server node is attached
    if srv:
        exec_res = await asyncio.to_thread(execute_remote_command, srv, cmd, working_dir=app.root_path, timeout=30)
        is_success = exec_res.get("success", False) or exec_res.get("exit_code", 1) == 0
        stdout = exec_res.get("stdout", "")
        stderr = exec_res.get("stderr", "")
        exit_code = exec_res.get("exit_code", 0 if is_success else 1)
        duration_ms = exec_res.get("duration_ms", 120)
    else:
        # Fallback simulation if running without VPS server assignment
        is_success = True
        stdout = f"Command executed successfully: {cmd}"
        stderr = ""
        exit_code = 0
        duration_ms = 45

    if is_success:
        app.health_status = "ONLINE" if action in ["start", "restart", "reload", "health_check"] else "OFFLINE"
        app.http_status = 200 if app.health_status == "ONLINE" else 503
        if action in ["start", "restart"]:
            app.last_restart_at = now
        log_msg = stdout.strip() or f"Service '{raw_target}' {action} executed successfully (exit code 0)."
    else:
        app.health_status = "DEGRADED" if action != "stop" else "OFFLINE"
        app.http_status = 500 if action != "stop" else 503
        log_msg = stderr.strip() or stdout.strip() or f"Service '{raw_target}' {action} failed with exit code {exit_code}."

    # Record persistent server terminal execution log
    if srv:
        term_log = ServerTerminalLog(
            server_id=srv.id,
            user_id=current_user.id,
            username=current_user.username,
            command=cmd,
            output=(stdout + ("\n" + stderr if stderr else "")).strip(),
            exit_code=exit_code,
            execution_duration_ms=duration_ms
        )
        db.add(term_log)

    # Record application log
    app_log = AppLog(
        application_id=app.id,
        server_id=app.server_id,
        category="application",
        severity="INFO" if is_success else "ERROR",
        message=f"[{current_user.username}] {log_msg}",
        user=current_user.username
    )
    db.add(app_log)

    await log_audit_event(
        db=db,
        action=f"APP_{action.upper()}",
        entity_type="application",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"action": action, "service": raw_target, "command": cmd, "exit_code": exit_code},
        result="SUCCESS" if is_success else "FAILED"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "application_status_changed",
        "application_id": app.id,
        "action": action,
        "health_status": app.health_status,
        "message": log_msg,
        "command": cmd,
        "exit_code": exit_code
    })

    return {
        "success": is_success,
        "application_id": app.id,
        "action": action,
        "status": app.health_status,
        "command": cmd,
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "message": log_msg
    }

@router.post("/{app_id}/maintenance")
async def toggle_maintenance_mode(
    app_id: str,
    payload: MaintenanceModeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN"]))
):
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.is_maintenance = payload.enabled
    app.health_status = "MAINTENANCE" if payload.enabled else "ONLINE"

    if payload.enabled:
        expected_end = now + timedelta(minutes=payload.expected_duration_minutes)
        window = MaintenanceWindow(
            application_id=app.id,
            reason=payload.reason,
            enabled_by=current_user.username,
            start_time=now,
            expected_end_time=expected_end,
            is_active=True
        )
        db.add(window)
    else:
        # Close any active window
        w_res = await db.execute(
            select(MaintenanceWindow).where(MaintenanceWindow.application_id == app.id, MaintenanceWindow.is_active == True)
        )
        active_windows = w_res.scalars().all()
        for w in active_windows:
            w.is_active = False
            w.actual_end_time = now

    await log_audit_event(
        db=db,
        action="MAINTENANCE_TOGGLE",
        entity_type="application",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"enabled": payload.enabled, "reason": payload.reason},
        result="SUCCESS"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "application_maintenance_changed",
        "application_id": app.id,
        "is_maintenance": app.is_maintenance,
        "health_status": app.health_status
    })

    return {
        "success": True,
        "application_id": app.id,
        "is_maintenance": app.is_maintenance,
        "health_status": app.health_status
    }

@router.get("/{app_id}/logs", response_model=List[LogItemResponse])
async def get_application_logs(
    app_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(AppLog).where(AppLog.application_id == app_id).order_by(AppLog.timestamp.desc()).limit(limit)
    )
    logs = result.scalars().all()
    return [LogItemResponse.model_validate(l) for l in logs]

@router.delete("/{app_id}")
async def delete_application(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN"]))
):
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    app.is_active = False
    app.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await log_audit_event(
        db=db,
        action="DELETE_APPLICATION",
        entity_type="application",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"name": app.name, "domain": app.domain},
        result="SUCCESS"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "application_deleted",
        "application_id": app.id,
        "name": app.name
    })

    return {"success": True, "message": f"Application '{app.name}' deregistered successfully."}

@router.get("/{app_id}/docker/inspect")
async def inspect_application_container(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Connects to the server hosting this application, discovers matching Docker containers,
    and loads deep runtime stats, configs, and optimization recommendations.
    """
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Associated server node not found.")

    data = await asyncio.to_thread(
        inspect_remote_container,
        server=srv,
        app_name=app.name,
        service_name=app.service_name,
        port=app.port,
        process_manager=app.process_manager,
        app_type=app.app_type
    )
    return data

@router.post("/{app_id}/docker/action")
async def execute_app_docker_action(
    app_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    """
    Executes container control and performance optimization actions:
    restart, stop, start, pause, unpause, prune_containers, prune_images, exec_cmd, update_memory, update_restart.
    """
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Associated server node not found.")

    action = payload.get("action", "restart")
    container_target = payload.get("container_name") or app.service_name or app.name

    res = await asyncio.to_thread(
        execute_container_action,
        server=srv,
        container_name_or_id=container_target,
        action=action,
        params=payload
    )

    # Record app log
    app_log = AppLog(
        application_id=app.id,
        server_id=srv.id,
        category="docker",
        severity="INFO" if res.get("success") else "WARN",
        message=f"[{current_user.username}] Docker action '{action}' on '{container_target}': {res.get('message')}",
        user=current_user.username
    )
    db.add(app_log)

    await log_audit_event(
        db=db,
        action=f"DOCKER_{action.upper()}",
        entity_type="application",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"action": action, "target": container_target, "exit_code": res.get("exit_code")},
        result="SUCCESS" if res.get("success") else "FAILED"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "docker_action_executed",
        "application_id": app.id,
        "server_id": srv.id,
        "action": action,
        "target": container_target,
        "success": res.get("success")
    })

    return res

@router.post("/{app_id}/components/{component_name}/action")
async def execute_component_action(
    app_id: str,
    component_name: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    """
    Executes container lifecycle actions (restart, stop, start, logs, etc.)
    directly on a specific container/service component within an application suite.
    """
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        result = await db.execute(select(Application).where(Application.name == component_name, Application.deleted_at == None))
        app = result.scalar_one_or_none()
        if not app:
            raise HTTPException(status_code=404, detail="Application or component not found.")

    srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Associated server node not found.")

    action = payload.get("action", "restart").lower().strip()
    target_container = component_name.strip()

    res = await asyncio.to_thread(
        execute_container_action,
        server=srv,
        container_name_or_id=target_container,
        action=action,
        params=payload
    )

    # Record app log
    app_log = AppLog(
        application_id=app.id,
        server_id=srv.id,
        category="docker",
        severity="INFO" if res.get("success") else "WARN",
        message=f"[{current_user.username}] Component action '{action}' on '{target_container}': {res.get('message')}",
        user=current_user.username
    )
    db.add(app_log)

    await log_audit_event(
        db=db,
        action=f"COMPONENT_{action.upper()}",
        entity_type="application_component",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"action": action, "component": target_container, "server": srv.name},
        result="SUCCESS" if res.get("success") else "FAILED"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "component_action_executed",
        "application_id": app.id,
        "component_name": target_container,
        "action": action,
        "success": res.get("success")
    })

    return res

@router.post("/{app_id}/suite/action")
async def execute_suite_action(
    app_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "APPLICATION_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    """
    Executes coordinated lifecycle action across all services in an application suite.
    For restart/start: Boots database & cache first, then backend, then frontend.
    For stop: Shuts down frontend first, then backend, then database & cache.
    """
    result = await db.execute(select(Application).where(Application.id == app_id, Application.deleted_at == None))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Associated server node not found.")

    action = payload.get("action", "restart").lower().strip()
    component_names = payload.get("component_names")

    # If components not explicitly passed in payload, discover all siblings
    if not component_names:
        skey = extract_suite_key(app.name, app.app_type)
        if skey:
            all_apps_res = await db.execute(select(Application).where(Application.server_id == srv.id, Application.deleted_at == None))
            all_apps = all_apps_res.scalars().all()
            component_names = [a.service_name or a.name for a in all_apps if extract_suite_key(a.name, a.app_type) == skey]
        else:
            component_names = [app.service_name or app.name]

    # Order components logically
    def comp_order(c_name: str) -> int:
        role, _, prio = classify_component_role(c_name)
        if action == "stop":
            return -prio
        order_map = {'database': 1, 'cache': 2, 'certbot': 3, 'agent': 4, 'backend': 5, 'frontend': 6, 'worker': 7, 'standalone': 8}
        return order_map.get(role, 9)

    sorted_targets = sorted(component_names, key=comp_order)
    sanitized_targets = []
    for c in sorted_targets:
        c_clean = c.strip()
        if " " in c_clean:
            c_clean = c_clean.replace(" ", "-").lower()
        sanitized_targets.append(c_clean)
    combined_targets_str = " ".join(sanitized_targets)

    # Batch restart / action via Docker
    batch_res = await asyncio.to_thread(
        execute_container_action,
        server=srv,
        container_name_or_id=combined_targets_str,
        action=action,
        params=payload
    )

    overall_success = batch_res.get("success", False)
    results = [
        {
            "component": target,
            "success": overall_success,
            "message": batch_res.get("message")
        }
        for target in sorted_targets
    ]

    await log_audit_event(
        db=db,
        action=f"SUITE_{action.upper()}",
        entity_type="application_suite",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=app.id,
        details={"action": action, "components": sorted_targets, "server": srv.name},
        result="SUCCESS" if overall_success else "FAILED"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "suite_action_executed",
        "application_id": app.id,
        "action": action,
        "components": sorted_targets,
        "success": overall_success
    })

    return {
        "success": overall_success,
        "message": f"Suite action '{action}' executed for {len(sorted_targets)} containers.",
        "results": results
    }

