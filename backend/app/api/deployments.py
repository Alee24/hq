from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Deployment, DeploymentRollback, Application
from backend.app.schemas.api_schemas import (
    DeploymentTriggerRequest, DeploymentResponse, RollbackRequest
)
from backend.app.services.deployment_engine import run_deployment_pipeline, run_rollback_pipeline

router = APIRouter(prefix="/deployments", tags=["Deployments & Rollbacks"])

@router.get("", response_model=List[DeploymentResponse])
async def list_deployments(
    application_id: Optional[str] = None,
    environment: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Deployment).order_by(Deployment.created_at.desc()).limit(limit)
    if application_id:
        stmt = stmt.where(Deployment.application_id == application_id)
    if environment and environment.lower() != "all":
        stmt = stmt.where(Deployment.environment == environment.lower())

    result = await db.execute(stmt)
    deployments = result.scalars().all()

    enriched = []
    for d in deployments:
        d_resp = DeploymentResponse.model_validate(d)
        app_res = await db.execute(select(Application).where(Application.id == d.application_id))
        app = app_res.scalar_one_or_none()
        if app:
            d_resp.application_name = app.name
        enriched.append(d_resp)

    return enriched

@router.get("/{deployment_id}", response_model=DeploymentResponse)
async def get_deployment(
    deployment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
    deployment = result.scalar_one_or_none()
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment record not found.")

    d_resp = DeploymentResponse.model_validate(deployment)
    app_res = await db.execute(select(Application).where(Application.id == deployment.application_id))
    app = app_res.scalar_one_or_none()
    if app:
        d_resp.application_name = app.name
    return d_resp

@router.post("/trigger", response_model=DeploymentResponse)
async def trigger_deployment(
    payload: DeploymentTriggerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    # Verify application exists
    app_res = await db.execute(select(Application).where(Application.id == payload.application_id))
    app = app_res.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    commit_hash = payload.commit_hash or "91bd721a9c4f"
    commit_message = f"Deploy release updates to {payload.environment}"

    try:
        deployment = await run_deployment_pipeline(
            db=db,
            application_id=payload.application_id,
            environment=payload.environment,
            branch=payload.branch,
            commit_hash=commit_hash,
            commit_message=commit_message,
            deployed_by=current_user.username,
            run_tests=payload.run_tests,
            create_backup=payload.create_backup
        )
        d_resp = DeploymentResponse.model_validate(deployment)
        d_resp.application_name = app.name
        return d_resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deployment pipeline failure: {str(e)}")

@router.post("/rollback")
async def trigger_rollback(
    payload: RollbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    if payload.confirmation != "ROLLBACK":
        raise HTTPException(
            status_code=400,
            detail="Safeguard confirmation required. You must enter 'ROLLBACK' to proceed."
        )

    try:
        rollback_record = await run_rollback_pipeline(
            db=db,
            deployment_id=payload.deployment_id,
            reason=payload.reason,
            triggered_by=current_user.username
        )
        return {
            "success": True,
            "rollback_id": rollback_record.id,
            "target_commit": rollback_record.target_commit,
            "status": rollback_record.status,
            "logs": rollback_record.logs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rollback failed: {str(e)}")
