from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.models.entities import (
    User, Application, Server, License, Deployment, Alert, Incident, Domain
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/metrics")
async def get_dashboard_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)

    # 1. Applications Stats
    apps_res = await db.execute(select(Application).where(Application.is_active == True, Application.deleted_at == None))
    apps = apps_res.scalars().all()
    
    app_total = len(apps)
    app_online = sum(1 for a in apps if a.health_status == "ONLINE")
    app_degraded = sum(1 for a in apps if a.health_status == "DEGRADED")
    app_offline = sum(1 for a in apps if a.health_status == "OFFLINE")
    app_maintenance = sum(1 for a in apps if a.is_maintenance)
    avg_uptime = round(sum(a.uptime_percent for a in apps) / app_total, 2) if app_total > 0 else 100.0

    # 2. Servers Stats
    srv_res = await db.execute(select(Server).where(Server.is_active == True, Server.deleted_at == None))
    servers = srv_res.scalars().all()
    server_total = len(servers)
    server_online = sum(1 for s in servers if s.status == "ONLINE")
    server_offline = sum(1 for s in servers if s.status == "OFFLINE")

    # 3. Licenses Stats
    lic_res = await db.execute(select(License).where(License.deleted_at == None))
    licenses = lic_res.scalars().all()
    lic_total = len(licenses)
    lic_active = sum(1 for l in licenses if l.status == "ACTIVE")
    lic_expiring_soon = sum(
        1 for l in licenses 
        if l.status == "ACTIVE" and (l.expires_at.replace(tzinfo=timezone.utc if l.expires_at.tzinfo is None else l.expires_at.tzinfo) - now).days <= 30
    )
    lic_expired = sum(1 for l in licenses if l.status == "EXPIRED")

    # 4. Deployments Stats (Today)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    dep_res = await db.execute(
        select(Deployment).order_by(Deployment.created_at.desc()).limit(10)
    )
    recent_deployments = dep_res.scalars().all()
    deployments_today = sum(
        1 for d in recent_deployments 
        if d.created_at.replace(tzinfo=timezone.utc if d.created_at.tzinfo is None else d.created_at.tzinfo) >= today_start
    )
    failed_deployments = sum(1 for d in recent_deployments if d.status == "FAILED")

    # 5. SSL Expiring Soon (< 30 days)
    dom_res = await db.execute(select(Domain).where(Domain.is_active == True))
    domains = dom_res.scalars().all()
    ssl_expiring_soon = sum(1 for d in domains if d.days_remaining <= 30)

    # 6. Active Alerts
    alert_res = await db.execute(select(Alert).where(Alert.is_resolved == False).order_by(Alert.created_at.desc()))
    active_alerts = alert_res.scalars().all()

    # 7. Recent Incidents
    inc_res = await db.execute(select(Incident).order_by(Incident.started_at.desc()).limit(5))
    incidents = inc_res.scalars().all()

    # 8. Pending Updates
    pending_updates = sum(1 for a in apps if a.current_commit != a.latest_repo_commit)

    return {
        "applications": {
            "total": app_total,
            "online": app_online,
            "degraded": app_degraded,
            "offline": app_offline,
            "maintenance": app_maintenance
        },
        "servers": {
            "total": server_total,
            "online": server_online,
            "offline": server_offline
        },
        "uptime": {
            "average_uptime": avg_uptime
        },
        "licenses": {
            "total": lic_total,
            "valid": lic_active,
            "expiring_soon": lic_expiring_soon,
            "expired": lic_expired
        },
        "deployments": {
            "today": deployments_today,
            "failed": failed_deployments,
            "recent": [
                {
                    "id": d.id,
                    "application_id": d.application_id,
                    "commit_hash": d.commit_hash,
                    "commit_message": d.commit_message,
                    "status": d.status,
                    "deployed_by": d.deployed_by,
                    "created_at": d.created_at.isoformat()
                } for d in recent_deployments[:5]
            ]
        },
        "ssl": {
            "expiring_soon": ssl_expiring_soon
        },
        "pending_updates": pending_updates,
        "active_alerts_count": len(active_alerts),
        "active_alerts": [
            {
                "id": a.id,
                "rule_name": a.rule_name,
                "severity": a.severity,
                "source_type": a.source_type,
                "source_name": a.source_name,
                "message": a.message,
                "created_at": a.created_at.isoformat()
            } for a in active_alerts[:5]
        ],
        "incidents": [
            {
                "id": i.id,
                "title": i.title,
                "severity": i.severity,
                "status": i.status,
                "started_at": i.started_at.isoformat(),
                "duration_seconds": i.duration_seconds
            } for i in incidents
        ]
    }
