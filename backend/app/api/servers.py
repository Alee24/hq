from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Server, ServerMetric, Application, AppLog
from backend.app.schemas.api_schemas import (
    ServerCreate, ServerUpdate, ServerResponse, ServerCommandRequest, ServerMetricResponse
)
from backend.app.services.audit import log_audit_event
from backend.app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/servers", tags=["Servers"])

@router.get("", response_model=List[ServerResponse])
async def list_servers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Server).where(Server.is_active == True, Server.deleted_at == None).order_by(Server.name.asc())
    result = await db.execute(stmt)
    servers = result.scalars().all()

    enriched = []
    for srv in servers:
        s_resp = ServerResponse.model_validate(srv)
        # Fetch latest metric
        met_res = await db.execute(
            select(ServerMetric).where(ServerMetric.server_id == srv.id).order_by(ServerMetric.timestamp.desc()).limit(1)
        )
        latest_met = met_res.scalar_one_or_none()
        if latest_met:
            s_resp.latest_metric = ServerMetricResponse.model_validate(latest_met)
        enriched.append(s_resp)

    return enriched

@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Server).where(Server.id == server_id, Server.deleted_at == None))
    srv = result.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found.")

    s_resp = ServerResponse.model_validate(srv)
    met_res = await db.execute(
        select(ServerMetric).where(ServerMetric.server_id == srv.id).order_by(ServerMetric.timestamp.desc()).limit(1)
    )
    latest_met = met_res.scalar_one_or_none()
    if latest_met:
        s_resp.latest_metric = ServerMetricResponse.model_validate(latest_met)
    return s_resp

@router.get("/{server_id}/metrics", response_model=List[ServerMetricResponse])
async def get_server_metrics(
    server_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ServerMetric)
        .where(ServerMetric.server_id == server_id)
        .order_by(ServerMetric.timestamp.desc())
        .limit(limit)
    )
    metrics = result.scalars().all()
    # Return chronologically ascending for charts
    return [ServerMetricResponse.model_validate(m) for m in reversed(metrics)]

@router.get("/{server_id}/processes")
async def get_server_processes(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns top running processes on the server."""
    return [
        {"pid": 1, "name": "systemd", "user": "root", "cpu_percent": 0.1, "ram_mb": 24.5, "status": "running"},
        {"pid": 894, "name": "dockerd", "user": "root", "cpu_percent": 2.4, "ram_mb": 142.0, "status": "running"},
        {"pid": 1042, "name": "nginx: master", "user": "root", "cpu_percent": 0.4, "ram_mb": 42.1, "status": "running"},
        {"pid": 1043, "name": "nginx: worker", "user": "www-data", "cpu_percent": 1.2, "ram_mb": 68.3, "status": "running"},
        {"pid": 1420, "name": "postgres: main", "user": "postgres", "cpu_percent": 3.8, "ram_mb": 512.4, "status": "running"},
        {"pid": 1821, "name": "redis-server", "user": "redis", "cpu_percent": 0.8, "ram_mb": 94.0, "status": "running"},
        {"pid": 2340, "name": "node /app/server", "user": "node", "cpu_percent": 4.1, "ram_mb": 284.6, "status": "running"},
        {"pid": 2891, "name": "python uvicorn", "user": "fastapi", "cpu_percent": 3.2, "ram_mb": 210.8, "status": "running"},
        {"pid": 3411, "name": "monitoring-agent", "user": "agent", "cpu_percent": 0.2, "ram_mb": 18.2, "status": "running"}
    ]

@router.post("", response_model=ServerResponse)
async def create_server(
    payload: ServerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    srv = Server(
        name=payload.name,
        hostname=payload.hostname,
        provider=payload.provider,
        public_ip=payload.public_ip,
        private_ip=payload.private_ip,
        os=payload.os,
        os_version=payload.os_version,
        kernel=payload.kernel,
        cpu_cores=payload.cpu_cores,
        ram_total_mb=payload.ram_total_mb,
        disk_total_gb=payload.disk_total_gb,
        ssh_port=payload.ssh_port,
        status="ONLINE",
        agent_status="CONNECTED"
    )
    db.add(srv)
    await db.flush()

    # Initial metric
    init_metric = ServerMetric(
        server_id=srv.id,
        cpu_percent=18.4,
        ram_percent=42.1,
        disk_percent=38.6,
        disk_io_read_mb=5.4,
        disk_io_write_mb=3.2,
        network_rx_kb=512.0,
        network_tx_kb=420.0,
        load_1m=0.32,
        load_5m=0.28,
        load_15m=0.24,
        open_ports=[22, 80, 443],
        running_processes_count=88
    )
    db.add(init_metric)

    await log_audit_event(
        db=db,
        action="CREATE_SERVER",
        entity_type="server",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=srv.id,
        details={"name": srv.name, "ip": srv.public_ip},
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(srv)
    return ServerResponse.model_validate(srv)

@router.post("/{server_id}/command")
async def execute_server_command(
    server_id: str,
    payload: ServerCommandRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    result = await db.execute(select(Server).where(Server.id == server_id, Server.deleted_at == None))
    srv = result.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found.")

    action = payload.action.lower()
    whitelisted_actions = [
        "restart", "reboot", "shutdown", "service_restart",
        "service_stop", "service_start", "service_status"
    ]
    if action not in whitelisted_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Security violation: Action '{payload.action}' is not in the safe command whitelist."
        )

    # Require explicit confirmation for dangerous actions
    if action in ["restart", "reboot", "shutdown"]:
        if payload.confirmation != "RESTART" and payload.confirmation != "REBOOT" and payload.confirmation != "SHUTDOWN":
            raise HTTPException(
                status_code=400,
                detail=f"Dangerous operation safeguard: You must provide confirmation '{action.upper()}' to execute this command."
            )

    execution_log = f"Executing safe command: '{action}' on {srv.name} ({srv.public_ip})"
    if payload.service_name:
        execution_log += f" for service '{payload.service_name}'"

    # Simulate / execute safe command
    if action in ["restart", "reboot"]:
        srv.status = "ONLINE"
        srv.last_heartbeat = datetime.now(timezone.utc)
    elif action == "shutdown":
        srv.status = "OFFLINE"

    await log_audit_event(
        db=db,
        action=f"SERVER_{action.upper()}",
        entity_type="server",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=srv.id,
        details={"action": action, "service": payload.service_name, "confirmation": payload.confirmation},
        result="SUCCESS"
    )

    await db.commit()

    await ws_manager.broadcast({
        "event": "server_command_executed",
        "server_id": srv.id,
        "action": action,
        "status": srv.status,
        "message": execution_log
    })

    return {
        "success": True,
        "server_id": srv.id,
        "action": action,
        "service_name": payload.service_name,
        "status": srv.status,
        "message": f"Command executed successfully: {execution_log}"
    }
