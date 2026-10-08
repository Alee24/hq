import uuid
import base64
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.entities import License, LicenseActivation
from backend.app.core.security import (
    sign_license_payload, verify_license_signature, get_master_license_keys
)
from backend.app.services.audit import log_audit_event

def generate_license_number() -> str:
    year = datetime.now(timezone.utc).year
    rand_part = str(uuid.uuid4().int)[:6].zfill(6)
    return f"LIC-{year}-{rand_part}"

async def create_new_license(
    db: AsyncSession,
    product_name: str,
    customer_name: str,
    customer_email: str,
    product_version: str = "v1.0.0",
    license_type: str = "Enterprise",
    allowed_installations: int = 5,
    expires_in_days: int = 365,
    features: Optional[Dict[str, Any]] = None,
    created_by: str = "admin"
) -> License:
    """Creates and cryptographically signs an Ed25519 digital enterprise license."""
    license_key = generate_license_number()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(days=expires_in_days)
    
    if features is None:
        features = {
            "high_availability": True,
            "api_rate_unlimited": True,
            "ssl_automation": True,
            "audit_compliance": True,
            "custom_branding": True
        }

    # Digital license payload
    payload = {
        "license_id": license_key,
        "product": product_name,
        "customer": customer_name,
        "email": customer_email,
        "version": product_version,
        "type": license_type,
        "installation_limit": allowed_installations,
        "features": features,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat()
    }

    payload_b64, sig_b64 = sign_license_payload(payload)

    lic = License(
        license_key=license_key,
        product_name=product_name,
        customer_name=customer_name,
        customer_email=customer_email,
        product_version=product_version,
        license_type=license_type,
        allowed_installations=allowed_installations,
        active_installations=0,
        status="ACTIVE",
        features=features,
        payload_b64=payload_b64,
        signature_b64=sig_b64,
        issued_at=now,
        expires_at=expires_at
    )
    db.add(lic)
    await db.flush()

    await log_audit_event(
        db=db,
        action="GENERATE_LICENSE",
        entity_type="license",
        username=created_by,
        entity_id=lic.id,
        details={
            "license_key": license_key,
            "customer": customer_name,
            "product": product_name,
            "expires_at": expires_at.isoformat()
        },
        result="SUCCESS"
    )

    await db.commit()
    await db.refresh(lic)
    return lic

async def activate_license_instance(
    db: AsyncSession,
    license_key: str,
    product_name: str,
    product_version: str,
    installation_fingerprint: str,
    hostname: str,
    ip_address: str = "127.0.0.1"
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Validates license rules, checks quota, registers activation fingerprint,
    and returns activation token and signature.
    """
    result = await db.execute(select(License).where(License.license_key == license_key, License.deleted_at == None))
    lic = result.scalar_one_or_none()
    if not lic:
        return False, "License key not found.", None

    if lic.status in ["REVOKED", "SUSPENDED", "INVALID"]:
        return False, f"License is currently {lic.status}.", None

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    exp_naive = lic.expires_at.replace(tzinfo=None) if lic.expires_at.tzinfo else lic.expires_at
    if exp_naive < now:
        lic.status = "EXPIRED"
        await db.commit()
        return False, "License has expired.", None

    # Check existing activation
    act_res = await db.execute(
        select(LicenseActivation).where(
            LicenseActivation.license_id == lic.id,
            LicenseActivation.installation_fingerprint == installation_fingerprint
        )
    )
    existing_act = act_res.scalar_one_or_none()
    if existing_act:
        existing_act.last_validated_at = now
        existing_act.hostname = hostname
        existing_act.ip_address = ip_address
        await db.commit()
        return True, "Activation refreshed successfully.", {
            "token": existing_act.token,
            "expires_at": lic.expires_at.isoformat(),
            "features": lic.features,
            "signature_b64": lic.signature_b64
        }

    # Check quota
    if lic.active_installations >= lic.allowed_installations:
        return False, f"Activation limit exceeded. Allowed: {lic.allowed_installations}, Active: {lic.active_installations}.", None

    # Create new activation
    token = f"ACT-{uuid.uuid4().hex}"
    activation = LicenseActivation(
        license_id=lic.id,
        installation_fingerprint=installation_fingerprint,
        hostname=hostname,
        ip_address=ip_address,
        token=token,
        activated_at=now,
        last_validated_at=now,
        is_active=True
    )
    db.add(activation)
    lic.active_installations += 1

    await log_audit_event(
        db=db,
        action="ACTIVATE_LICENSE",
        entity_type="license",
        username=f"node:{hostname}",
        entity_id=lic.id,
        details={
            "license_key": lic.license_key,
            "fingerprint": installation_fingerprint,
            "hostname": hostname,
            "ip": ip_address
        },
        result="SUCCESS"
    )

    await db.commit()

    return True, "License activated successfully.", {
        "token": token,
        "expires_at": lic.expires_at.isoformat(),
        "features": lic.features,
        "signature_b64": lic.signature_b64
    }

def format_offline_license_file(lic: License) -> str:
    """
    Generates a production-grade digitally signed license file content (license.key)
    with human-readable metadata, base64 payload, and cryptographic Ed25519 signature.
    """
    _, pub_pem = get_master_license_keys()
    
    file_content = f"""# ==============================================================================
# CENTRAL SOFTWARE COMMAND CENTER - SIGNED ENTERPRISE LICENSE KEY
# PRODUCT: {lic.product_name}
# LICENSE ID: {lic.license_key}
# CUSTOMER: {lic.customer_name} ({lic.customer_email})
# ISSUED AT: {lic.issued_at.isoformat()}
# EXPIRES AT: {lic.expires_at.isoformat()}
# INSTALLATION LIMIT: {lic.allowed_installations}
# ==============================================================================

-----BEGIN COMMAND CENTER LICENSE PAYLOAD-----
{lic.payload_b64}
-----END COMMAND CENTER LICENSE PAYLOAD-----

-----BEGIN COMMAND CENTER DIGITAL SIGNATURE (ED25519)-----
{lic.signature_b64}
-----END COMMAND CENTER DIGITAL SIGNATURE (ED25519)-----

-----BEGIN COMMAND CENTER PUBLIC VERIFICATION KEY-----
{pub_pem.strip()}
-----END COMMAND CENTER PUBLIC VERIFICATION KEY-----
"""
    return file_content
