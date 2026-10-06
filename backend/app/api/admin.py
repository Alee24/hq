from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import hashlib
import uuid
import json
import csv
import io
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.core.security import hash_password
from backend.app.models.entities import User, ApiKey, AuditLog
from backend.app.schemas.api_schemas import (
    UserResponse, UserRegister, ApiKeyCreate, ApiKeyResponse, AuditLogResponse
)
from backend.app.services.audit import log_audit_event

router = APIRouter(prefix="/admin", tags=["Administration"])

# ==========================================
# Users Management
# ==========================================

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN"]))
):
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]

@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role: str = Query(..., description="Role"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN"]))
):
    valid_roles = [
        "SUPER_ADMIN", "INFRASTRUCTURE_ADMIN", "DEPLOYMENT_ADMIN",
        "APPLICATION_ADMIN", "LICENSE_ADMIN", "MONITORING_ADMIN", "READ_ONLY"
    ]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Allowed roles: {', '.join(valid_roles)}")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_role = user.role
    user.role = role

    await log_audit_event(
        db=db,
        action="UPDATE_USER_ROLE",
        entity_type="user",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=user.id,
        details={"user": user.username, "old_role": old_role, "new_role": role},
        result="SUCCESS"
    )

    await db.commit()
    return {"success": True, "user_id": user.id, "role": user.role}

# ==========================================
# API Keys Management
# ==========================================

@router.get("/api-keys", response_model=List[ApiKeyResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN"]))
):
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = result.scalars().all()
    return [ApiKeyResponse.model_validate(k) for k in keys]

@router.post("/api-keys")
async def create_api_key(
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN"]))
):
    raw_token = f"cc_live_{uuid.uuid4().hex}{uuid.uuid4().hex[:12]}"
    prefix = raw_token[:10]
    key_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    key_record = ApiKey(
        name=payload.name,
        key_hash=key_hash,
        prefix=prefix,
        role=payload.role,
        is_active=True
    )
    db.add(key_record)
    await db.flush()

    await log_audit_event(
        db=db,
        action="CREATE_API_KEY",
        entity_type="api_key",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=key_record.id,
        details={"name": payload.name, "role": payload.role, "prefix": prefix},
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(key_record)

    return {
        "id": key_record.id,
        "name": key_record.name,
        "prefix": prefix,
        "role": key_record.role,
        "api_key": raw_token, # Shown once!
        "created_at": key_record.created_at.isoformat()
    }

@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN"]))
):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    key_record = result.scalar_one_or_none()
    if not key_record:
        raise HTTPException(status_code=404, detail="API key not found.")

    key_record.is_active = False
    await log_audit_event(
        db=db,
        action="REVOKE_API_KEY",
        entity_type="api_key",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=key_record.id,
        details={"name": key_record.name, "prefix": key_record.prefix},
        result="SUCCESS"
    )

    await db.commit()
    return {"success": True, "message": "API Key revoked successfully."}

# ==========================================
# Immutable Audit Logs
# ==========================================

@router.get("/audit", response_model=List[AuditLogResponse])
async def list_audit_logs(
    action: Optional[str] = None,
    username: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if username:
        stmt = stmt.where(AuditLog.username == username)
    if entity_type and entity_type.lower() != "all":
        stmt = stmt.where(AuditLog.entity_type == entity_type.lower())

    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [AuditLogResponse.model_validate(l) for l in logs]
