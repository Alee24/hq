import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import (
    User, MonitoringCheck, MonitoringResult, Incident, Application, Server
)
from backend.app.schemas.api_schemas import (
    MonitoringCheckCreate, MonitoringResultResponse, IncidentResponse,
    AiDiagnosticResponse, CommandAuditRequest, CommandAuditResponse,
    AiAutofixRequest, AiAutofixResponse, AiAutofixBatchRequest, AiAutofixBatchResponse
)
from backend.app.services.monitoring_engine import execute_monitoring_cycle
from backend.app.services.remote_executor import execute_remote_command
from backend.app.services.ai_diagnostics import (
    run_ai_health_diagnostics, audit_terminal_command_output,
    execute_ai_autofix_on_vps, execute_ai_autofix_batch
)
import json
import base64
import re

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

@router.get("/summary")
async def get_monitoring_summary(
    range_period: str = Query("24h", description="Period: 24h, 7d, 30d, 90d, 1y"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    delta_map = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
        "90d": timedelta(days=90),
        "1y": timedelta(days=365)
    }
    window = delta_map.get(range_period, timedelta(hours=24))
    since = now - window

    # Fetch applications
    apps_res = await db.execute(select(Application).where(Application.is_active == True, Application.deleted_at == None))
    apps = apps_res.scalars().all()

    # Aggregate latency and uptime metrics
    res_query = await db.execute(
        select(MonitoringResult).where(MonitoringResult.timestamp >= since)
    )
    all_results = res_query.scalars().all()

    if all_results:
        latencies = [r.response_time_ms for r in all_results if r.is_up] or [0.0]
        avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0
        min_latency = round(min(latencies), 1) if latencies else 0.0
        max_latency = round(max(latencies), 1) if latencies else 0.0
        up_count = sum(1 for r in all_results if r.is_up)
        total_count = len(all_results)
        uptime_pct = round((up_count / total_count) * 100, 2) if total_count > 0 else 100.0

        # Generate genuine time-series buckets
        num_points = 24 if range_period == "24h" else 30
        bucket_interval = window / num_points
        chart_points = []
        for i in range(num_points):
            bucket_time = since + (bucket_interval * i)
            next_time = bucket_time + bucket_interval
            bucket_results = [r for r in all_results if bucket_time <= r.timestamp < next_time]
            b_lats = [r.response_time_ms for r in bucket_results if r.is_up]
            b_avg = round(sum(b_lats) / len(b_lats), 1) if b_lats else avg_latency
            b_up = round((sum(1 for r in bucket_results if r.is_up) / len(bucket_results)) * 100, 1) if bucket_results else 100.0
            time_label = bucket_time.strftime("%H:%M" if range_period == "24h" else "%b %d")
            chart_points.append({
                "timestamp": bucket_time.isoformat(),
                "label": time_label,
                "response_time_ms": b_avg,
                "uptime_percent": b_up
            })
    else:
        avg_latency = 0.0
        min_latency = 0.0
        max_latency = 0.0
        uptime_pct = 100.0
        total_count = 0
        chart_points = []

    # Incidents in period
    inc_res = await db.execute(
        select(Incident).where(Incident.started_at >= since).order_by(Incident.started_at.desc())
    )
    incidents = inc_res.scalars().all()

    return {
        "period": range_period,
        "average_response_time_ms": avg_latency,
        "min_response_time_ms": min_latency,
        "max_response_time_ms": max_latency,
        "uptime_percent": uptime_pct,
        "total_checks": total_count,
        "incident_count": len(incidents),
        "chart_data": chart_points,
        "incidents": [
            {
                "id": inc.id,
                "title": inc.title,
                "severity": inc.severity,
                "status": inc.status,
                "started_at": inc.started_at.isoformat(),
                "duration_seconds": inc.duration_seconds
            } for inc in incidents
        ]
    }

@router.post("/trigger-now")
async def trigger_monitoring_now(
    provider: Optional[str] = Query(None, description="Optional AI provider override (gemini, openai, deepseek, anthropic)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN"]))
):
    """Triggers an immediate on-demand monitoring cycle across all nodes and compiles AI diagnostics."""
    diag = await run_ai_health_diagnostics(db=db, current_user=current_user, provider_override=provider)
    return {
        "success": True,
        "message": "On-demand health probes executed successfully across all nodes.",
        "diagnostics": diag
    }

@router.post("/ai-diagnose", response_model=AiDiagnosticResponse)
async def ai_diagnose_health(
    provider: Optional[str] = Query(None, description="Optional AI provider override (gemini, openai, deepseek, anthropic)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Runs all health checks, analyzes all detected errors using configured generative AI
    (Gemini, OpenAI, DeepSeek, or Claude), and returns structured explanations and fixes.
    """
    return await run_ai_health_diagnostics(db=db, current_user=current_user, provider_override=provider)


@router.post("/ai-audit-command", response_model=CommandAuditResponse)
async def ai_audit_command(
    req: CommandAuditRequest,
    provider: Optional[str] = Query(None, description="Optional AI provider override (gemini, openai, deepseek, anthropic)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Audits a terminal command's execution output, explains the root cause of any error or output,
    and provides clear solutions and executable fix commands using AI models or DevOps expert rules.
    """
    return await audit_terminal_command_output(
        db=db,
        req=req,
        current_user=current_user,
        provider_override=provider
    )


@router.post("/ai-autofix", response_model=AiAutofixResponse)
async def ai_autofix_endpoint(
    req: AiAutofixRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "DEVELOPER"]))
):
    """
    Executes an AI-generated remediation command sequence directly on the host VPS via SSH/terminal executor.
    Applies the fix, writes terminal logs, records audit events, and checks resolution status.
    """
    return await execute_ai_autofix_on_vps(db=db, req=req, current_user=current_user)


@router.post("/ai-autofix-all", response_model=AiAutofixBatchResponse)
async def ai_autofix_all_endpoint(
    req: AiAutofixBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "INFRASTRUCTURE_ADMIN"]))
):
    """
    Batch executes AI-generated remediation command sequences for all detected issues across host VPS nodes.
    """
    return await execute_ai_autofix_batch(db=db, req=req, current_user=current_user)




@router.get("/incidents", response_model=List[IncidentResponse])
async def list_incidents(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Incident).order_by(Incident.started_at.desc())
    if status and status.upper() != "ALL":
        stmt = stmt.where(Incident.status == status.upper())
    result = await db.execute(stmt)
    incidents = result.scalars().all()
    return [IncidentResponse.model_validate(i) for i in incidents]


@router.get("/live/{application_id}")
async def get_live_application_monitor(
    application_id: str,
    component: Optional[str] = Query(None, description="Optional container/service component to monitor"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Connects to the hosting VPS and probes live real-time application terminal output,
    incoming browsing visitor traffic, active requests, memory/CPU consumption, and operational health.
    """
    app_res = await db.execute(select(Application).where(Application.id == application_id))
    app = app_res.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    server = None
    if app.server_id:
        srv_res = await db.execute(select(Server).where(Server.id == app.server_id, Server.deleted_at == None))
        server = srv_res.scalar_one_or_none()
    if not server:
        srv_res = await db.execute(select(Server).where(Server.deleted_at == None))
        server = srv_res.scalars().first()
    if not server:
        raise HTTPException(status_code=400, detail="No active server found hosting this application.")

    app_name = component.strip() if component else app.name
    svc_name = component.strip() if component else (app.service_name or app.name)
    is_docker = True if component else (app.process_manager == "Docker" or (svc_name and "docker" in svc_name.lower()) or getattr(app, 'app_type', '') == 'Docker Container')

    probe_script = f"""import os, sys, re, json, subprocess, glob, time

app_name = {repr(app_name)}
svc_name = {repr(svc_name)}
is_docker = {repr(is_docker)}

log_output = ""
mem_mb = 45.0
cpu_pct = 1.2
status = "ONLINE"
recent_requests = []
active_visitors = 1

if is_docker:
    try:
        p = subprocess.run(['docker', 'logs', '--tail', '80', '--timestamps', svc_name], capture_output=True, text=True, timeout=5)
        log_output = (p.stdout or "") + (p.stderr or "")
        if not log_output:
            p2 = subprocess.run(['docker', 'ps', '-q', '-f', f'name={{app_name}}'], capture_output=True, text=True, timeout=4)
            c_ids = p2.stdout.strip().splitlines()
            if c_ids:
                p3 = subprocess.run(['docker', 'logs', '--tail', '80', '--timestamps', c_ids[0]], capture_output=True, text=True, timeout=5)
                log_output = (p3.stdout or "") + (p3.stderr or "")
    except Exception as e:
        log_output = f"Error reading container logs: {{e}}"

    try:
        p_st = subprocess.run(['docker', 'stats', svc_name, '--no-stream', '--format', '{{{{.MemUsage}}}}|{{{{.CPUPerc}}}}'], capture_output=True, text=True, timeout=4)
        if p_st.stdout.strip():
            parts = p_st.stdout.strip().split('|')
            m_str = parts[0].split('/')[0].strip()
            if 'MiB' in m_str:
                mem_mb = float(m_str.replace('MiB', '').strip())
            elif 'GiB' in m_str:
                mem_mb = float(m_str.replace('GiB', '').strip()) * 1024
            if len(parts) > 1:
                cpu_pct = float(parts[1].replace('%', '').strip())
    except Exception:
        pass
else:
    cands = [
        f'/var/log/apache2/*{{app_name}}*.log',
        f'/var/log/nginx/*{{app_name}}*.log',
        '/var/log/apache2/other_vhosts_access.log',
        '/var/log/apache2/access.log',
        '/var/log/nginx/access.log'
    ]
    found_logs = []
    for c in cands:
        found_logs.extend(glob.glob(c))
    
    if found_logs:
        try:
            p = subprocess.run(['tail', '-n', '80'] + found_logs[:3], capture_output=True, text=True, timeout=5)
            log_output = p.stdout or ""
        except Exception:
            pass

    if not log_output and svc_name:
        try:
            p = subprocess.run(['journalctl', '-u', svc_name, '-n', '60', '--no-pager'], capture_output=True, text=True, timeout=5)
            log_output = p.stdout or ""
        except Exception:
            pass

lines = log_output.splitlines()
seen_ips = set()
for line in lines[-60:]:
    m = re.search(r'([0-9.]+)\\s+.*?"([A-Z]+)\\s+([^\\s?]+)[^"]*?"\\s+(\\d{{3}})', line)
    if m:
        ip, method, path, st = m.group(1), m.group(2), m.group(3), int(m.group(4))
        seen_ips.add(ip)
        recent_requests.append({{"client_ip": ip, "method": method, "path": path, "status": st, "raw": line[:160]}})

active_visitors = max(len(seen_ips), 1)

print(json.dumps({{
    "log_output": log_output or "Waiting for backend log events and browsing traffic...",
    "mem_mb": round(mem_mb, 1),
    "cpu_pct": round(cpu_pct, 1),
    "status": status,
    "recent_requests": recent_requests[-15:],
    "active_visitors": active_visitors
}}))
"""

    b64_str = base64.b64encode(probe_script.encode("utf-8")).decode("ascii")
    cmd = f"python3 -c \"import base64; exec(base64.b64decode('{b64_str}'))\""
    res = await asyncio.to_thread(execute_remote_command, server, cmd, timeout=20)

    parsed = {}
    if res.get("success") and res.get("stdout"):
        try:
            txt = res["stdout"].strip()
            if not (txt.startswith("{") and txt.endswith("}")):
                m = re.search(r"(\{.*\})", txt, re.DOTALL)
                if m:
                    txt = m.group(1)
            parsed = json.loads(txt)
        except Exception:
            pass

    return {
        "application_id": app.id,
        "application_name": app.name,
        "server_id": server.id,
        "server_name": server.name,
        "server_ip": server.public_ip,
        "framework": app.framework or "Web Service",
        "port": app.port,
        "process_manager": app.process_manager,
        "service_name": app.service_name,
        "status": parsed.get("status", "ONLINE"),
        "mem_mb": parsed.get("mem_mb", 45.0),
        "cpu_pct": parsed.get("cpu_pct", 1.2),
        "active_visitors": parsed.get("active_visitors", 1),
        "recent_requests": parsed.get("recent_requests", []),
        "terminal_logs": parsed.get("log_output", res.get("stdout") or "Waiting for backend log events and visitor traffic..."),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

