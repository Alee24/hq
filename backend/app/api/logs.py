from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import io
import csv
import json
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.models.entities import User, AppLog
from backend.app.schemas.api_schemas import LogItemResponse

router = APIRouter(prefix="/logs", tags=["Centralized Logs"])

@router.get("", response_model=List[LogItemResponse])
async def search_logs(
    category: Optional[str] = Query(None, description="Category (application, nginx, apache, systemd, docker, deployment, auth, security, monitoring)"),
    severity: Optional[str] = Query(None, description="Severity (DEBUG, INFO, WARN, ERROR, CRITICAL)"),
    application_id: Optional[str] = None,
    server_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(AppLog).order_by(AppLog.timestamp.desc()).limit(limit)
    if category and category.lower() != "all":
        stmt = stmt.where(AppLog.category == category.lower())
    if severity and severity.upper() != "ALL":
        stmt = stmt.where(AppLog.severity == severity.upper())
    if application_id:
        stmt = stmt.where(AppLog.application_id == application_id)
    if server_id:
        stmt = stmt.where(AppLog.server_id == server_id)
    if search:
        stmt = stmt.where(AppLog.message.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [LogItemResponse.model_validate(l) for l in logs]

@router.get("/export")
async def export_logs(
    format: str = Query("csv", description="Format: csv or json"),
    category: Optional[str] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(AppLog).order_by(AppLog.timestamp.desc()).limit(1000)
    if category and category.lower() != "all":
        stmt = stmt.where(AppLog.category == category.lower())
    if severity and severity.upper() != "ALL":
        stmt = stmt.where(AppLog.severity == severity.upper())

    result = await db.execute(stmt)
    logs = result.scalars().all()

    if format == "json":
        data = [
            {
                "id": l.id,
                "timestamp": l.timestamp.isoformat(),
                "category": l.category,
                "severity": l.severity,
                "application_id": l.application_id,
                "server_id": l.server_id,
                "user": l.user,
                "message": l.message
            }
            for l in logs
        ]
        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=command_center_logs.json"}
        )

    # CSV format
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Severity", "Category", "AppID", "ServerID", "User", "Message"])
    for l in logs:
        writer.writerow([
            l.timestamp.isoformat(),
            l.severity,
            l.category,
            l.application_id or "",
            l.server_id or "",
            l.user or "",
            l.message
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=command_center_logs.csv"}
    )
