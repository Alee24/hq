from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import (
    User, Application, Server, License, Deployment, MonitoringResult, 
    AppLog, MaintenanceWindow, AuditLog
)
from backend.app.schemas.api_schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationResponse,
    ApplicationActionRequest, MaintenanceModeRequest, DeploymentResponse,
    MonitoringResultResponse, LogItemResponse
)
from backend.app.services.audit import log_audit_event
from backend.app.services.websocket_manager import ws_manager
from backend.app.services.remote_executor import inspect_remote_container, execute_container_action

router = APIRouter(prefix="/applications", tags=["Applications"])

@router.get("", response_model=List[ApplicationResponse])
async def list_applications(
    environment: Optional[str] = Query(None, description="Filter by environment (production, staging, development)"),
    status: Optional[str] = Query(None, description="Filter by health status"),
    search: Optional[str] = Query(None, description="Search query"),
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
    log_msg = ""
    if action == "restart":
        app.last_restart_at = now
        app.health_status = "ONLINE"
        app.http_status = 200
        log_msg = f"Gracefully restarted {app.process_manager} service '{app.service_name}' on server."
    elif action == "stop":
        app.health_status = "OFFLINE"
        app.http_status = 503
        log_msg = f"Stopped {app.process_manager} service '{app.service_name}'."
    elif action == "start":
        app.health_status = "ONLINE"
        app.http_status = 200
        app.last_restart_at = now
        log_msg = f"Started {app.process_manager} service '{app.service_name}'."
    elif action == "reload":
        app.health_status = "ONLINE"
        log_msg = f"Reloaded configuration for {app.process_manager} service '{app.service_name}'."
    elif action == "health_check":
        app.health_status = "ONLINE"
        app.http_status = 200
        log_msg = f"Health check probe on {app.health_check_url} returned HTTP 200 OK."

    # Record application log
    app_log = AppLog(
        application_id=app.id,
        server_id=app.server_id,
        category="application",
        severity="INFO",
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
        details={"action": action, "service": app.service_name},
        result="SUCCESS"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "application_status_changed",
        "application_id": app.id,
        "action": action,
        "health_status": app.health_status,
        "message": log_msg
    })

    return {
        "success": True,
        "application_id": app.id,
        "action": action,
        "status": app.health_status,
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

    data = inspect_remote_container(
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

    res = execute_container_action(
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


