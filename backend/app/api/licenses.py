from fastapi import APIRouter, Depends, HTTPException, status, Response, Body
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

@router.get("/summary")
async def get_licensing_summary(db: AsyncSession = Depends(get_db)):
    """Returns complete licensing summary, connected nodes telemetry, and alerts."""
    import sqlite3, os
    db_path = "/opt/command_center/command_center.db"
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path, timeout=5)
            conn.row_factory = sqlite3.Row
            total_licenses = conn.execute("SELECT COUNT(*) FROM licenses").fetchone()[0]
            total_nodes = conn.execute("SELECT COUNT(*) FROM activations WHERE status = 'ACTIVE'").fetchone()[0]
            total_alerts = conn.execute("SELECT COUNT(*) FROM telemetry_alerts").fetchone()[0]

            alerts = [dict(r) for r in conn.execute("SELECT * FROM telemetry_alerts ORDER BY id DESC LIMIT 50").fetchall()]
            activations = [dict(r) for r in conn.execute("SELECT * FROM activations ORDER BY last_heartbeat DESC LIMIT 50").fetchall()]
            licenses_raw = conn.execute("SELECT * FROM licenses ORDER BY created_at DESC").fetchall()

            usage_counts = {
                r["license_id"]: r["c"]
                for r in conn.execute("SELECT license_id, COUNT(*) as c FROM activations WHERE status = 'ACTIVE' GROUP BY license_id").fetchall()
            }
            licenses = []
            for r in licenses_raw:
                d = dict(r)
                d["active_nodes"] = usage_counts.get(d["license_id"], 0)
                licenses.append(d)
            conn.close()

            _, pub_pem = get_master_license_keys()
            import base64
            from cryptography.hazmat.primitives import serialization
            priv_obj, pub_obj = get_master_license_keys()
            spki_b64 = "MCowBQYDK2VwAyEAehbE7F+NH01lC10NO1JhD94O28oKvV24sv9juu5UJHw="

            return {
                "status": "ok",
                "total_licenses": total_licenses,
                "total_nodes": total_nodes,
                "total_alerts": total_alerts,
                "public_key_b64": spki_b64,
                "alerts": alerts,
                "activations": activations,
                "licenses": licenses
            }
        except Exception:
            pass

    # PostgreSQL fallback
    result = await db.execute(select(License).where(License.deleted_at == None))
    all_lics = result.scalars().all()
    act_res = await db.execute(select(LicenseActivation))
    all_acts = act_res.scalars().all()
    _, pub_pem = get_master_license_keys()

    return {
        "status": "ok",
        "total_licenses": len(all_lics),
        "total_nodes": len([a for a in all_acts if a.is_active]),
        "total_alerts": 0,
        "public_key_b64": "MCowBQYDK2VwAyEAehbE7F+NH01lC10NO1JhD94O28oKvV24sv9juu5UJHw=",
        "alerts": [],
        "activations": [
            {
                "license_id": a.license_id,
                "customer": "Client Node",
                "machine_id": a.installation_fingerprint,
                "hostname": a.hostname,
                "ip_address": a.ip_address,
                "app_name": a.product_name,
                "app_version": a.product_version,
                "last_heartbeat": a.last_validated_at.isoformat() if a.last_validated_at else a.created_at.isoformat(),
                "status": "ACTIVE" if a.is_active else "INACTIVE"
            }
            for a in all_acts
        ],
        "licenses": [
            {
                "license_id": l.license_key,
                "customer": l.customer_name,
                "email": l.customer_email,
                "product": l.product_name,
                "type": l.license_type,
                "installation_limit": l.allowed_installations,
                "active_nodes": l.active_installations,
                "status": l.status,
                "expires_at": l.expires_at.isoformat() if l.expires_at else None,
                "is_revoked": l.status == "REVOKED"
            }
            for l in all_lics
        ]
    }

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
    payload: Optional[dict] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "LICENSE_ADMIN"]))
):
    action = (payload.get("action") if payload else "revoke") or "revoke"
    reason = (payload.get("reason") if payload else None)

    stmt = select(License).where(
        (License.id == license_id) | (License.license_key == license_id)
    )
    result = await db.execute(stmt)
    lic = result.scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found.")

    is_reinstating = action.lower() in ["reinstate", "restore", "activate"]
    new_status = "ACTIVE" if is_reinstating else "REVOKED"
    lic.status = new_status

    # Also synchronize activations
    act_res = await db.execute(select(LicenseActivation).where(LicenseActivation.license_id == lic.id))
    activations = act_res.scalars().all()
    for act in activations:
        act.is_active = is_reinstating

    await log_audit_event(
        db=db,
        action="REINSTATE_LICENSE" if is_reinstating else "REVOKE_LICENSE",
        entity_type="license",
        username=current_user.username,
        user_id=current_user.id,
        entity_id=lic.id,
        details={"license_key": lic.license_key, "action": action, "reason": reason},
        result="SUCCESS"
    )
    await db.commit()

    return {"success": True, "license_id": lic.id, "status": new_status, "action": action}

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
    lic.expires_at = new_exp.replace(tzinfo=None) if new_exp.tzinfo else new_exp
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

@router.post("/alerts/{alert_id}/license-and-activate")
async def license_and_activate_alert_endpoint(
    alert_id: str,
    payload: Optional[dict] = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "LICENSE_ADMIN"]))
):
    import sqlite3, os, json, uuid
    req = payload or {}

    db_path = "/opt/command_center/command_center.db" if os.path.exists("/opt/command_center/command_center.db") else ("./command_center.db" if os.path.exists("./command_center.db") else None)

    customer = req.get("customer")
    product = req.get("product") or "Smart Campus GatePass & Access Suite"
    email = req.get("email") or current_user.email or "mettoalex@gmail.com"
    limit = int(req.get("installation_limit") or 5)
    exp_days = int(req.get("expires_in_days") or 365)
    lic_type = req.get("license_type") or "Enterprise"

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    exp_utc = now_utc + timedelta(days=exp_days)
    lic_key = f"LIC-{now_utc.year}-{uuid.uuid4().hex[:8].upper()}"

    machine_id = alert_id
    hostname = "N/A"
    ip_address = "127.0.0.1"

    if db_path:
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            alt = conn.execute("SELECT * FROM telemetry_alerts WHERE id = ? OR machine_id = ? ORDER BY id DESC LIMIT 1", (alert_id, alert_id)).fetchone()
            if alt:
                machine_id = alt["machine_id"] or alert_id
                hostname = alt["hostname"] or ""
                ip_address = alt["ip_address"] or ""
                product = req.get("product") or alt["app_name"] or product
            if not customer:
                customer = f"{hostname} ({machine_id[:8]})" if hostname and hostname != "N/A" else f"Node-{machine_id[:12]}"

            # Generate digital certificate
            priv_obj, pub_obj = get_master_license_keys()
            features = {"all": True, "gatepass": True, "security": True, "telemetry": True, "api_access": True}
            cert_payload = {
                "license_id": lic_key,
                "product": product,
                "customer": customer,
                "email": email,
                "type": lic_type,
                "installation_limit": limit,
                "machine_id": machine_id,
                "features": features,
                "issued_at": now_utc.isoformat(),
                "expires_at": exp_utc.isoformat()
            }
            canonical_bytes = json.dumps(cert_payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
            sig_bytes = priv_obj.sign(canonical_bytes)
            import base64
            from cryptography.hazmat.primitives import serialization
            sig_b64 = base64.b64encode(sig_bytes).decode('utf-8')
            payload_b64 = base64.b64encode(json.dumps(cert_payload, separators=(',', ':')).encode('utf-8')).decode('utf-8')
            spki_pub_b64 = base64.b64encode(pub_obj.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)).decode('utf-8')

            certificate_text = (
                "-----BEGIN COMMAND CENTER LICENSE PAYLOAD-----\n"
                f"{payload_b64}\n"
                "-----END COMMAND CENTER LICENSE PAYLOAD-----\n"
                "-----BEGIN COMMAND CENTER DIGITAL SIGNATURE (ED25519)-----\n"
                f"{sig_b64}\n"
                "-----END COMMAND CENTER DIGITAL SIGNATURE (ED25519)-----\n"
                "-----BEGIN COMMAND CENTER PUBLIC VERIFICATION KEY-----\n"
                f"{spki_pub_b64}\n"
                "-----END COMMAND CENTER PUBLIC VERIFICATION KEY-----\n"
            )

            conn.execute("""
                INSERT INTO licenses (
                    license_id, customer, email, product, type, installation_limit,
                    issued_at, expires_at, features, is_revoked, revocation_reason, certificate
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
            """, (
                lic_key, customer, email, product, lic_type, limit,
                now_utc.isoformat(), exp_utc.isoformat(), json.dumps(features), certificate_text
            ))

            conn.execute("""
                INSERT OR REPLACE INTO activations (
                    license_id, machine_id, customer, client_name, hostname,
                    ip_address, app_name, app_version, activated_at, last_heartbeat, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'v1.0.0', ?, ?, 'ACTIVE')
            """, (
                lic_key, machine_id, customer, customer, hostname,
                ip_address, product, now_utc.isoformat(), now_utc.isoformat()
            ))

            conn.execute("DELETE FROM telemetry_alerts WHERE id = ? OR machine_id = ?", (alert_id, machine_id))
            conn.commit()
            conn.close()

            # Auto-install to Smart Campus if present
            for sc_dir in ["/var/www/smartcampus/data", "/var/www/smartcampus"]:
                if os.path.isdir(sc_dir):
                    try:
                        with open(os.path.join(sc_dir, "license.lic"), "w", encoding="utf-8") as lf:
                            lf.write(certificate_text.strip() + "\n")
                        seal = os.path.join(sc_dir, ".license_lock_seal")
                        if os.path.exists(seal):
                            os.remove(seal)
                        ledger = os.path.join(sc_dir, ".license_grace_ledger")
                        if os.path.exists(ledger):
                            os.remove(ledger)
                    except Exception:
                        pass

            await log_audit_event(
                db=db,
                action="LICENSE_AND_ACTIVATE_ALERT",
                entity_type="license",
                username=current_user.username,
                user_id=current_user.id,
                entity_id=lic_key,
                details={"alert_id": alert_id, "machine_id": machine_id, "license_key": lic_key},
                result="SUCCESS"
            )

            return {
                "success": True,
                "message": f"Successfully licensed node {machine_id} with license {lic_key}.",
                "license_id": lic_key,
                "machine_id": machine_id,
                "customer": customer,
                "product": product,
                "certificate": certificate_text,
                "public_key": spki_pub_b64
            }
        except Exception as e:
            pass

    # Generic PostgreSQL fallback
    customer = customer or f"Node-{machine_id[:12]}"
    new_lic = await create_new_license(
        db=db,
        product_name=product,
        customer_name=customer,
        customer_email=email,
        product_version="v1.0.0",
        license_type=lic_type,
        allowed_installations=limit,
        expires_in_days=exp_days,
        created_by=current_user.username
    )

    cert_text = format_offline_license_file(new_lic)
    await activate_license_instance(
        db=db,
        license_key=new_lic.license_key,
        product_name=product,
        product_version="v1.0.0",
        installation_fingerprint=machine_id,
        hostname=hostname,
        ip_address=ip_address
    )

    return {
        "success": True,
        "message": f"Successfully licensed node {machine_id} with license {new_lic.license_key}.",
        "license_id": new_lic.license_key,
        "machine_id": machine_id,
        "customer": customer,
        "product": product,
        "certificate": cert_text,
        "public_key": "MCowBQYDK2VwAyEAehbE7F+NH01lC10NO1JhD94O28oKvV24sv9juu5UJHw="
    }

