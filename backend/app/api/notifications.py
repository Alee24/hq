from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, EmailStr

from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.models.entities import User, SmtpSetting, NotificationLog
from backend.app.services.email_service import send_email_async, _build_html_template

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class SmtpConfigRequest(BaseModel):
    host: str
    port: int = 587
    username: str = ""
    password: Optional[str] = None
    sender_email: str
    sender_name: str = "Command Center HQ"
    encryption: str = "STARTTLS"  # STARTTLS, SSL, TLS, NONE
    is_enabled: bool = True
    notify_on_login: bool = True
    notify_on_outage: bool = True
    notify_on_ssl_expiry: bool = True
    notify_on_dns_mismatch: bool = True
    notify_on_failed_deployment: bool = True
    notify_on_critical_alert: bool = True
    recipients: List[str] = []


class SmtpTestRequest(BaseModel):
    recipient: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None
    encryption: Optional[str] = None


@router.get("/smtp")
async def get_smtp_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await db.execute(select(SmtpSetting).limit(1))
    smtp = res.scalar_one_or_none()
    if not smtp:
        return {
            "configured": False,
            "host": "",
            "port": 587,
            "username": "",
            "has_password": False,
            "sender_email": "",
            "sender_name": "Command Center HQ",
            "encryption": "STARTTLS",
            "is_enabled": False,
            "notify_on_login": True,
            "notify_on_outage": True,
            "notify_on_ssl_expiry": True,
            "notify_on_dns_mismatch": True,
            "notify_on_failed_deployment": True,
            "notify_on_critical_alert": True,
            "recipients": [current_user.email] if current_user.email else [],
            "last_tested_at": None,
            "last_test_status": None,
            "last_test_error": None
        }

    return {
        "configured": True,
        "id": smtp.id,
        "host": smtp.host,
        "port": smtp.port,
        "username": smtp.username,
        "has_password": bool(smtp.password_hash),
        "sender_email": smtp.sender_email,
        "sender_name": smtp.sender_name,
        "encryption": smtp.encryption,
        "is_enabled": smtp.is_enabled,
        "notify_on_login": smtp.notify_on_login,
        "notify_on_outage": smtp.notify_on_outage,
        "notify_on_ssl_expiry": smtp.notify_on_ssl_expiry,
        "notify_on_dns_mismatch": smtp.notify_on_dns_mismatch,
        "notify_on_failed_deployment": smtp.notify_on_failed_deployment,
        "notify_on_critical_alert": smtp.notify_on_critical_alert,
        "recipients": smtp.recipients or [],
        "last_tested_at": smtp.last_tested_at.isoformat() if smtp.last_tested_at else None,
        "last_test_status": smtp.last_test_status,
        "last_test_error": smtp.last_test_error
    }


@router.post("/smtp")
async def save_smtp_config(
    payload: SmtpConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await db.execute(select(SmtpSetting).limit(1))
    smtp = res.scalar_one_or_none()

    recipients_clean = list({r.strip().lower() for r in payload.recipients if r.strip()})
    if not recipients_clean and current_user.email:
        recipients_clean = [current_user.email.lower()]

    if not smtp:
        smtp = SmtpSetting(
            host=payload.host.strip(),
            port=payload.port,
            username=payload.username.strip(),
            password_hash=payload.password or "",
            sender_email=payload.sender_email.strip().lower(),
            sender_name=payload.sender_name.strip(),
            encryption=payload.encryption.strip().upper(),
            is_enabled=payload.is_enabled,
            notify_on_login=payload.notify_on_login,
            notify_on_outage=payload.notify_on_outage,
            notify_on_ssl_expiry=payload.notify_on_ssl_expiry,
            notify_on_dns_mismatch=payload.notify_on_dns_mismatch,
            notify_on_failed_deployment=payload.notify_on_failed_deployment,
            notify_on_critical_alert=payload.notify_on_critical_alert,
            recipients=recipients_clean,
        )
        db.add(smtp)
    else:
        smtp.host = payload.host.strip()
        smtp.port = payload.port
        smtp.username = payload.username.strip()
        if payload.password:
            smtp.password_hash = payload.password
        smtp.sender_email = payload.sender_email.strip().lower()
        smtp.sender_name = payload.sender_name.strip()
        smtp.encryption = payload.encryption.strip().upper()
        smtp.is_enabled = payload.is_enabled
        smtp.notify_on_login = payload.notify_on_login
        smtp.notify_on_outage = payload.notify_on_outage
        smtp.notify_on_ssl_expiry = payload.notify_on_ssl_expiry
        smtp.notify_on_dns_mismatch = payload.notify_on_dns_mismatch
        smtp.notify_on_failed_deployment = payload.notify_on_failed_deployment
        smtp.notify_on_critical_alert = payload.notify_on_critical_alert
        smtp.recipients = recipients_clean

    await db.commit()
    await db.refresh(smtp)
    return {
        "success": True,
        "message": "SMTP configuration and alert triggers saved successfully.",
        "id": smtp.id,
        "is_enabled": smtp.is_enabled
    }


@router.post("/smtp/test")
async def send_test_email(
    payload: SmtpTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_rcpt = payload.recipient.strip().lower()
    if not target_rcpt:
        raise HTTPException(status_code=400, detail="Recipient email address is required.")

    smtp_override: Optional[Dict[str, Any]] = None
    if payload.host:
        smtp_override = {
            "host": payload.host,
            "port": payload.port or 587,
            "username": payload.username or "",
            "password": payload.password or "",
            "sender_email": payload.sender_email or target_rcpt,
            "sender_name": payload.sender_name or "Command Center HQ",
            "encryption": payload.encryption or "STARTTLS",
            "recipients": [target_rcpt],
        }

    title = "SMTP Verification & Live Alert Channel Test"
    badge = "TEST PASSED"
    color = "#10b981"
    subtitle = "Your Central Command Center SMTP connection was tested and verified successfully."
    rows = [
        ("Recipient", target_rcpt),
        ("Tested By", current_user.username),
        ("Status", "Operational & Ready for Critical Alerts"),
    ]

    html = _build_html_template(title, badge, color, subtitle, rows)
    plain = f"Command Center SMTP Test: Connection verified successfully for {target_rcpt}."

    res = await send_email_async(
        subject="[HQ Test] SMTP Connection Verification",
        html_content=html,
        plain_content=plain,
        event_type="TEST",
        custom_recipients=[target_rcpt],
        smtp_override=smtp_override
    )

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "SMTP test failed"))

    return {
        "success": True,
        "message": f"Test email sent successfully to {target_rcpt}.",
        "duration_ms": res.get("duration_ms", 0)
    }


@router.get("/logs")
async def get_notification_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await db.execute(
        select(NotificationLog).order_by(desc(NotificationLog.created_at)).limit(limit)
    )
    logs = res.scalars().all()
    return [
        {
            "id": l.id,
            "event_type": l.event_type,
            "recipient": l.recipient,
            "subject": l.subject,
            "status": l.status,
            "error_message": l.error_message,
            "created_at": l.created_at.isoformat() if l.created_at else None
        } for l in logs
    ]
