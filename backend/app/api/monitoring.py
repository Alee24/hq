from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import (
    User, MonitoringCheck, MonitoringResult, Incident, Application
)
from backend.app.schemas.api_schemas import (
    MonitoringCheckCreate, MonitoringResultResponse, IncidentResponse
)
from backend.app.services.monitoring_engine import execute_monitoring_cycle

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

@router.get("/summary")
async def get_monitoring_summary(
    range_period: str = Query("24h", description="Period: 24h, 7d, 30d, 90d, 1y"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "MONITORING_ADMIN"]))
):
    """Triggers an immediate on-demand monitoring cycle."""
    await execute_monitoring_cycle()
    return {"success": True, "message": "On-demand monitoring cycle executed successfully across all nodes."}

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
