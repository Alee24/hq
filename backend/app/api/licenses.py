from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, License, LicenseActivation
from backend.app.schemas.api_schemas import (
    LicenseCreate, LicenseResponse, LicenseValidateRequest,
    LicenseValidateResponse, LicenseActivateRequest, LicenseActivateResponse,
    LicenseActivationInfo
)
from backend.app.services.license_engine import (
    create_new_license, activate_license_instance, format_offline_license_file
)
from backend.app.core.security import get_master_license_keys, verify_license_signature
from backend.app.services.audit import log_audit_event

router = APIRouter(prefix="/licenses", tags=["License Management"])

def to_license_response(lic: License, activations: list = None) -> LicenseResponse:
    activations_list = activations or []
    return LicenseResponse(
        id=lic.id,
        license_key=lic.license_key,
        product_name=lic.product_name,
        customer_name=lic.customer_name,
        customer_email=lic.customer_email,
        product_version=lic.product_version,
        license_type=lic.license_type,
        allowed_installations=lic.allowed_installations,
        active_installations=lic.active_installations,
        available_installations=max(0, lic.allowed_installations - lic.active_installations),
        status=lic.status,
        features=lic.features or {},
        payload_b64=lic.payload_b64,
        signature_b64=lic.signature_b64,
        issued_at=lic.issued_at,
        expires_at=lic.expires_at,
        activations=[LicenseActivationInfo.model_validate(act) for act in activations_list]
    )

@router.get("", response_model=List[LicenseResponse])
async def list_licenses(
    status: Optional[str] = None,
    product: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(License).where(License.deleted_at == None).order_by(License.created_at.desc())
    if status and status.upper() != "ALL":
        stmt = stmt.where(License.status == status.upper())
    if product:
        stmt = stmt.where(License.product_name.ilike(f"%{product}%"))

    result = await db.execute(stmt)
    licenses = result.scalars().all()

    enriched = []
    for lic in licenses:
        act_res = await db.execute(select(LicenseActivation).where(LicenseActivation.license_id == lic.id))
        activations = act_res.scalars().all()
        enriched.append(to_license_response(lic, activations))

    return enriched

@router.get("/metrics")
async def get_license_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    result = await db.execute(select(License).where(License.deleted_at == None))
    licenses = result.scalars().all()

    total = len(licenses)
    active = sum(1 for l in licenses if l.status == "ACTIVE")
    expired = sum(1 for l in licenses if l.status == "EXPIRED")
    suspended = sum(1 for l in licenses if l.status == "SUSPENDED")
    revoked = sum(1 for l in licenses if l.status == "REVOKED")

    # Expirations by horizons
    exp_7 = 0
    exp_30 = 0
    exp_60 = 0
    exp_90 = 0

    for l in licenses:
        if l.status == "ACTIVE":
            exp_tz = l.expires_at.replace(tzinfo=timezone.utc if l.expires_at.tzinfo is None else l.expires_at.tzinfo)
            days = (exp_tz - now).days
            if 0 <= days <= 7:
                exp_7 += 1
            if 0 <= days <= 30:
                exp_30 += 1
            if 0 <= days <= 60:
                exp_60 += 1
            if 0 <= days <= 90:
                exp_90 += 1

    return {
        "total": total,
        "active": active,
        "expired": expired,
        "suspended": suspended,
        "revoked": revoked,
        "expiring_within_7_days": exp_7,
        "expiring_within_30_days": exp_30,
        "expiring_within_60_days": exp_60,
        "expiring_within_90_days": exp_90
    }

@router.get("/public-key")
async def get_public_verification_key():
    """Returns the cryptographic Ed25519 public key for client applications to verify offline signatures."""
    _, pub_pem = get_master_license_keys()
    return {"public_key_pem": pub_pem}

@router.get("/{license_id}", response_model=LicenseResponse)
async def get_license(
    license_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(License).where(License.id == license_id, License.deleted_at == None))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found.")

    act_res = await db.execute(select(LicenseActivation).where(LicenseActivation.license_id == lic.id))
    activations = act_res.scalars().all()
    return to_license_response(lic, activations)

@router.get("/{license_id}/download-key")
async def download_license_key_file(
    license_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(License).where(License.id == license_id, License.deleted_at == None))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found.")

    content = format_offline_license_file(lic)
    filename = f"{lic.license_key}.key"
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("", response_model=LicenseResponse)
async def create_license(
    payload: LicenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "LICENSE_ADMIN"]))
):
    lic = await create_new_license(
        db=db,
        product_name=payload.product_name,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        product_version=payload.product_version,
        license_type=payload.license_type,
        allowed_installations=payload.allowed_installations,
        expires_in_days=payload.expires_in_days,
        features=payload.features,
        created_by=current_user.username
    )
    return to_license_response(lic, [])

@router.post("/validate", response_model=LicenseValidateResponse)
async def validate_license(
    payload: LicenseValidateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Public Server-Side License Validation endpoint invoked periodically by deployed applications.
    """
    stmt = select(License).where(License.license_key == payload.license_key, License.deleted_at == None)
    result = await db.execute(stmt)
    lic = result.scalar_one_or_none()

    if not lic:
        return LicenseValidateResponse(
            valid=False,
            status="INVALID",
            message="License key does not exist or is unrecognized by command center."
        )

    if lic.status in ["REVOKED", "SUSPENDED", "INVALID"]:
        return LicenseValidateResponse(
            valid=False,
            status=lic.status,
            message=f"License status is {lic.status}."
        )

    now = datetime.now(timezone.utc)
    exp_tz = lic.expires_at.replace(tzinfo=timezone.utc if lic.expires_at.tzinfo is None else lic.expires_at.tzinfo)
    if exp_tz < now:
        lic.status = "EXPIRED"
        await db.commit()
        return LicenseValidateResponse(
            valid=False,
            status="EXPIRED",
            message="License expired on " + exp_tz.strftime("%Y-%m-%d"),
            expires_at=lic.expires_at
        )

    # Check activation fingerprint
    act_res = await db.execute(
        select(LicenseActivation).where(
            LicenseActivation.license_id == lic.id,
            LicenseActivation.installation_fingerprint == payload.installation_fingerprint
        )
    )
    act = act_res.scalar_one_or_none()
    if not act:
        return LicenseValidateResponse(
            valid=False,
            status="UNREGISTERED_INSTALLATION",
            message="Machine installation fingerprint has not been activated for this license."
        )

    act.last_validated_at = now
    await db.commit()

    return LicenseValidateResponse(
        valid=True,
        status="ACTIVE",
        message="License validation verified successfully.",
        expires_at=lic.expires_at,
        features=lic.features or {},
        validation_token=act.token
    )

@router.post("/activate", response_model=LicenseActivateResponse)
async def activate_license(
    payload: LicenseActivateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Public Server-Side License Activation endpoint invoked during application installation.
    """
    success, message, data = await activate_license_instance(
        db=db,
        license_key=payload.license_key,
        product_name=payload.product_name,
        product_version=payload.product_version,
        installation_fingerprint=payload.installation_fingerprint,
        hostname=payload.hostname,
        ip_address=payload.ip_address or "127.0.0.1"
    )

    if not success or not data:
        raise HTTPException(status_code=400, detail=message)

    return LicenseActivateResponse(
        success=True,
        message=message,
        license_key=payload.license_key,
        status="ACTIVE",
        expires_at=datetime.fromisoformat(data["expires_at"]),
        token=data["token"],
        features=data["features"],
        signature_b64=data["signature_b64"]
    )

@router.post("/{license_id}/revoke")
async def revoke_license(
    license_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "LICENSE_ADMIN"]))
):
    result = await db.execute(select(License).where(License.id == license_id))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found.")

    lic.status = "REVOKED"
    await log_audit_event(
        db=db,
        action="REVOKE_LICENSE",
        entity_type="license",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=lic.id,
        details={"license_key": lic.license_key, "product": lic.product_name},
        result="SUCCESS"
    )
    await db.commit()

    return {"success": True, "license_id": lic.id, "status": "REVOKED"}

@router.post("/{license_id}/renew")
async def renew_license(
    license_id: str,
    additional_days: int = 365,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "LICENSE_ADMIN"]))
):
    result = await db.execute(select(License).where(License.id == license_id))
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found.")

    now = datetime.now(timezone.utc)
    current_exp = lic.expires_at.replace(tzinfo=timezone.utc if lic.expires_at.tzinfo is None else lic.expires_at.tzinfo)
    new_exp = max(now, current_exp) + timedelta(days=additional_days)
    lic.expires_at = new_exp
    lic.status = "ACTIVE"

    await log_audit_event(
        db=db,
        action="RENEW_LICENSE",
        entity_type="license",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=lic.id,
        details={"license_key": lic.license_key, "new_expiry": new_exp.isoformat()},
        result="SUCCESS"
    )
    await db.commit()

    return {"success": True, "license_id": lic.id, "expires_at": new_exp.isoformat(), "status": "ACTIVE"}
