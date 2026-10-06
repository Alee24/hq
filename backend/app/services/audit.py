from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.entities import AuditLog

async def log_audit_event(
    db: AsyncSession,
    action: str,
    entity_type: str,
    username: str = "system",
    user_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    ip_address: str = "127.0.0.1",
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    result: str = "SUCCESS"
):
    """Immutable audit logging utility for all infrastructure and management operations."""
    try:
        log_entry = AuditLog(
            user_id=user_id,
            username=username,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details or {},
            result=result
        )
        db.add(log_entry)
        await db.commit()
    except Exception as e:
        # In audit systems, failures must be handled safely so they do not crash the primary flow, but logged
        print(f"[AUDIT ERROR] Failed to record audit log: {e}")
