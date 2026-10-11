import os
import logging
import platform
import base64
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Body
from pydantic import BaseModel

from app.licensing.manager import (
    license_manager,
    LicenseStatus,
    VENDOR_EMAIL,
    VENDOR_PHONE,
    VENDOR_WHATSAPP,
    VENDOR_WEBSITE,
    LICENSING_PORTAL_DEFAULT_URL
)
from app.licensing.fingerprint import get_machine_fingerprint
from app.licensing.crypto import sign_license_payload
from app.licensing.cli import DEFAULT_VENDOR_PRIVATE_KEY_PEM
from app.licensing.lockdown import disengage_lock_seal
from app.models import User, SystemConfig
from app.database import get_session
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
import json
import httpx

from app.routers.reports import ensure_admin

logger = logging.getLogger("smartcampus.licensing.router")

router = APIRouter(prefix="/license", tags=["Enterprise Licensing"])


class ActivateRequest(BaseModel):
    license_key: str


class LicenseDeactivateResponse(BaseModel):
    success: bool
    message: str


@router.get("/status", response_model=LicenseStatus)
async def get_license_status(session: AsyncSession = Depends(get_session)):
    """
    Returns live cryptographic status of the system license.
    Unauthenticated so the Activation Wizard & Countdown Banner can display status and hardware ID.
    Ultra-resilient: guaranteed never to throw an unhandled 500 error.
    """
    try:
        status = license_manager.validate_license(force_refresh=True)
    except Exception as e:
        logger.error(f"[Licensing] Error in get_license_status: {e}", exc_info=True)
        # Fallback to safe LicenseStatus
        mid = "SC-DETECTING"
        try:
            mid = license_manager.server_machine_id
        except Exception:
            pass

        status = LicenseStatus(
            is_valid=True,
            status="GRACE_PERIOD",
            message="Licensing engine operational. System requires an enterprise license to maintain active services.",
            licensee="Evaluation Mode",
            server_machine_id=mid,
            in_grace_period=True,
            grace_days_remaining=7,
            grace_seconds_remaining=7 * 86400,
            contact_email="support@smartcampus.ac.ke",
            contact_phone="",
            contact_whatsapp="",
            contact_website=""
        )

    # Dynamically inject the customer's actual configured company name
    try:
        stmt = select(SystemConfig).where(SystemConfig.key == "company_settings")
        cfg = (await session.exec(stmt)).first()
        if cfg and cfg.value:
            data = json.loads(cfg.value)
            c_name = data.get("company_name", "").strip()
            if c_name:
                # If licensee is generic or Riara University by default, adopt the actual company name!
                if status.licensee in ["Riara University", "Customer", "Valued Customer", "Unlicensed Evaluation", "Enterprise Campus", "Default Institution", "Unknown", ""]:
                    status.licensee = c_name
                    if status.is_valid and status.status == "ACTIVE":
                        status.message = (
                            f"Lifetime Enterprise License is permanently certified for '{c_name}'."
                            if status.is_perpetual
                            else f"License is active and certified for '{c_name}'."
                        )
    except Exception as ex:
        logger.debug(f"[Licensing] Could not resolve company_name from settings: {ex}")

    return status


@router.get("/fingerprint")
async def get_system_fingerprint():
    """
    Returns server hardware Machine ID for license binding and direct vendor contacts.
    """
    try:
        mid = license_manager.server_machine_id
    except Exception:
        mid = get_machine_fingerprint()

    return {
        "machine_id": mid,
        "platform": f"{platform.system()} {platform.machine()}",
        "vendor": {
            "name": "Enterprise Licensing Support",
            "email": "support@smartcampus.ac.ke",
            "phone": "",
            "whatsapp": "",
            "website": "",
        },
        "instructions": (
            "Provide this Machine ID to technical support or system administration "
            "to receive your authentic signed enterprise license file."
        )
    }


@router.get("/vendor-contacts")
async def get_vendor_contacts():
    """
    Returns official software owner contact channels for licensing and emergency support.
    """
    return {
        "vendor_name": "Enterprise Licensing Support",
        "email": "support@smartcampus.ac.ke",
        "phone": "",
        "whatsapp_url": "",
        "website_url": "",
        "company": "Smart Campus Enterprise",
        "support_note": "Contact system administration for enterprise license generation and system activation."
    }


@router.get("/portal-status")
async def get_portal_status():
    """
    Tests live connection to the Central Command Center (https://hq.kkdes.co.ke).
    """
    url = (os.getenv("COMMAND_CENTER_URL") or os.getenv("LICENSING_PORTAL_URL", LICENSING_PORTAL_DEFAULT_URL)).rstrip("/")
    endpoints = [f"{url}/health", f"{url}/api/v1/licenses/health", f"{url}/api/health", f"{url}/api/v1/health"]
    start_time = datetime.now()

    for ep in endpoints:
        try:
            async with httpx.AsyncClient(timeout=4.0, verify=False) as client:
                resp = await client.get(ep)
                latency = int((datetime.now() - start_time).total_seconds() * 1000)
                if resp.status_code in [200, 204]:
                    try:
                        data = resp.json()
                    except Exception:
                        data = {}
                    return {
                        "is_online": True,
                        "portal_url": url,
                        "latency_ms": latency,
                        "service": "License Verification Service",
                        "vendor": "Enterprise Licensing",
                        "status": "CONNECTED"
                    }
        except Exception:
            pass

    return {
        "is_online": False,
        "portal_url": url,
        "latency_ms": 0,
        "status": "STANDALONE_SECURE",
        "note": "License verification operating in secure standalone mode."
    }


@router.post("/verify-online")
async def verify_online_license():
    """
    Triggers an immediate live heartbeat verification against the Central Command Center.
    """
    res = await license_manager.check_portal_heartbeat()
    current_status = license_manager.validate_license(force_refresh=True)
    return {
        "heartbeat_result": res,
        "status": current_status
    }


@router.get("/heartbeat")
@router.post("/heartbeat")
@router.post("/phone-home")
async def phone_home_command_center():
    """
    Manually triggers connect-back activation sync and heartbeat to Central Command Center (https://hq.kkdes.co.ke).
    Supports GET /heartbeat, POST /heartbeat, and POST /phone-home.
    """
    heartbeat_res = await license_manager.check_portal_heartbeat()
    cb_res = await license_manager.report_activation_to_command_center()
    current_status = license_manager.validate_license(force_refresh=True)
    return {
        "success": True,
        "heartbeat": heartbeat_res,
        "connect_back": cb_res,
        "status": current_status
    }



@router.post("/auto-activate")
async def auto_activate_license(session: AsyncSession = Depends(get_session)):
    """
    Automates all licensing steps in 1-Click:
    1. Identifies server Machine ID / hardware node binding.
    2. Dynamically queries the configured institution/company name from database.
    3. Connects to Central Licensing Portal (https://hq.kkdes.co.ke) to register and activate.
    4. If offline/air-gapped, falls back to embedded cryptographic authority.
    5. Clears any lockdown seals or evaluation grace counters.
    6. Returns certified active status immediately.
    """
    try:
        # Clear any stale lockdown seal so auto-activation proceeds uninhibited
        disengage_lock_seal()

        # 1. Resolve company name from settings
        c_name = "Enterprise Campus"
        try:
            stmt = select(SystemConfig).where(SystemConfig.key == "company_settings")
            cfg = (await session.exec(stmt)).first()
            if cfg and cfg.value:
                data = json.loads(cfg.value)
                name_val = data.get("company_name", "").strip()
                if name_val:
                    c_name = name_val
        except Exception as e:
            logger.debug(f"[AutoActivate] Could not read company name from DB: {e}")

        clean_email_domain = "".join(c for c in c_name.lower() if c.isalnum()) or "campus"

        # 2. Attempt Central Command Center Registration & Activation first
        try:
            portal_status = await license_manager.activate_via_portal(
                client_name=c_name,
                admin_email=f"admin@{clean_email_domain}.com"
            )
            if portal_status.is_valid and portal_status.status == "ACTIVE":
                portal_status.licensee = c_name
                portal_status.is_perpetual = True
                portal_status.message = f"Enterprise License registered via Central Command Center and permanently certified for '{c_name}'."
                logger.info(f"[AutoActivate] Certified via Command Center for '{c_name}'")
                return {
                    "success": True,
                    "message": f"Installation verified with Central Command Center and activated for '{c_name}'!",
                    "status": portal_status,
                    "activated_via": "central_portal"
                }
        except Exception as portal_err:
            logger.info(f"[AutoActivate] Command Center connection not available ({portal_err}), falling back to embedded cryptographic authority...")

        # 3. Resilient Fallback: Build payload and sign with embedded master key
        now_utc = datetime.now(timezone.utc)
        license_id = f"LIC-{now_utc.year}-{uuid.uuid4().hex[:8].upper()}"

        payload = {
            "license_id": license_id,
            "customer_name": c_name,
            "customer_email": f"admin@{clean_email_domain}.com",
            "machine_id": "*",  # Universal wildcard: guaranteed never to lock out across container restarts
            "tier": "lifetime",
            "is_perpetual": True,
            "modules": ["all"],
            "max_users": 250000,
            "max_gates": 100,
            "issued_at": now_utc.strftime("%Y-%m-%d"),
            "expires_at": "2099-12-31",
            "grace_period_days": 14,
            "air_gapped": True,
        }

        # Cryptographically sign payload using official master vendor private key
        priv_pem_bytes = DEFAULT_VENDOR_PRIVATE_KEY_PEM.encode("utf-8")
        sig_b64 = sign_license_payload(payload, priv_pem_bytes)

        # Create compact token: SC-LIC.<payload_b64>.<sig_b64>
        payload_b64 = base64.b64encode(json.dumps(payload, separators=(',', ':')).encode('utf-8')).decode('utf-8')
        compact_token = f"SC-LIC.{payload_b64}.{sig_b64}"

        # Activate license in licensing manager (writes to disk, unseals lock, purges grace ledger)
        status = license_manager.activate_license(compact_token)

        # Ensure licensee matches resolved company name
        status.licensee = c_name
        status.is_perpetual = True
        status.message = f"Lifetime Enterprise License is permanently certified for '{c_name}'."

        logger.info(f"[AutoActivate] Platform successfully auto-activated with Lifetime License for '{c_name}'")
        return {
            "success": True,
            "message": f"System permanently activated with Lifetime Enterprise License for '{c_name}'!",
            "status": status,
            "license_key": compact_token,
            "activated_via": "embedded_authority"
        }
    except Exception as exc:
        logger.error(f"[AutoActivate] Error during automated activation: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to auto-activate license: {str(exc)}")


@router.post("/activate")
async def activate_license_key(body: ActivateRequest):
    """
    Activates the platform using Command Center certificate, compact key, or PEM certificate string.
    Connects back to Central Command Center (https://hq.kkdes.co.ke) upon activation.
    """
    key = body.license_key.lstrip('\ufeff').strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key cannot be empty.")

    # Disengage any existing lock seal before attempting activation
    disengage_lock_seal()
    license_manager._purge_grace_ledger()
    license_manager._cached_status = None

    status = license_manager.activate_license(key)
    if not status.is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"License activation rejected: {status.message}"
        )

    # Disengage again to ensure disk markers are clean
    disengage_lock_seal()

    # Trigger connect-back reporting to Central Command Center
    cb_result = {}
    try:
        from app.licensing.crypto import parse_license_certificate
        parsed = parse_license_certificate(key)
        cb_result = await license_manager.report_activation_to_command_center(parsed[0] if parsed else None)
    except Exception as e:
        logger.debug(f"[Licensing] Connect-back reporting non-critical note: {e}")

    return {
        "success": True,
        "message": f"License successfully verified and activated for {status.licensee}!",
        "status": status,
        "connect_back": cb_result
    }


@router.post("/upload")
async def upload_license_file(file: UploadFile = File(...)):
    """
    Activates the platform by uploading a signed Command Center .lic certificate file.
    Connects back to Central Command Center (https://hq.kkdes.co.ke) upon activation.
    """
    try:
        content_bytes = await file.read()
        raw_text = content_bytes.decode("utf-8", errors="replace").lstrip('\ufeff').strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read license file: {str(e)}")

    if not raw_text:
        raise HTTPException(status_code=400, detail="Uploaded license file is empty.")

    # Disengage any existing lock seal before attempting activation
    disengage_lock_seal()
    license_manager._purge_grace_ledger()
    license_manager._cached_status = None

    status = license_manager.activate_license(raw_text)
    if not status.is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"License activation rejected: {status.message}"
        )

    # Disengage again to ensure disk markers are clean
    disengage_lock_seal()

    # Trigger connect-back reporting to Central Command Center
    cb_result = {}
    try:
        from app.licensing.crypto import parse_license_certificate
        parsed = parse_license_certificate(raw_text)
        cb_result = await license_manager.report_activation_to_command_center(parsed[0] if parsed else None)
    except Exception as e:
        logger.debug(f"[Licensing] Connect-back reporting non-critical note: {e}")


    return {
        "success": True,
        "message": f"License certificate accepted and activated for {status.licensee}!",
        "status": status,
        "connect_back": cb_result
    }


@router.delete("/deactivate", response_model=LicenseDeactivateResponse)
async def deactivate_license(admin: User = Depends(ensure_admin)):
    """
    Deactivates the license (Admin only, e.g. for server migration).
    """
    from app.licensing.manager import LICENSE_FILE_PATHS
    deleted_any = False
    for path in LICENSE_FILE_PATHS:
        if os.path.exists(path):
            try:
                os.remove(path)
                deleted_any = True
            except Exception:
                pass

    license_manager._cached_status = None
    new_status = license_manager.validate_license(force_refresh=True)

    return {
        "success": True,
        "message": f"License deactivated. Platform status: {new_status.status} ({new_status.grace_days_remaining} grace days)."
    }


@router.post("/enforce-suspension")
async def enforce_remote_suspension(body: Optional[Dict[str, Any]] = Body(None)):
    """
    Instant push receiver from Central Command Center (HQ).
    Immediately freezes system operations and engages cryptographic lock seal.
    """
    b = body or {}
    reason = b.get("reason") or "Terms violation or non-payment"
    lic_id = b.get("license_id")
    mid = license_manager.server_machine_id
    from app.licensing.lockdown import engage_lock_seal, LOCK_SEAL_PATHS
    engage_lock_seal("REVOKED_BY_VENDOR_PORTAL", mid, license_id=lic_id)
    for p in LOCK_SEAL_PATHS:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    sd = json.load(f)
                sd["portal_reason"] = reason
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(sd, f, indent=2)
            except Exception:
                pass
    license_manager._cached_status = None
    cur = license_manager.validate_license(force_refresh=True)
    cur.is_locked = True
    cur.is_revoked_by_portal = True
    cur.lock_reason = "REVOKED_BY_VENDOR_PORTAL"
    cur.portal_reason = reason
    cur.status = "SUSPENDED"
    cur.message = f"APPLICATION SUSPENDED BY HQ: {reason}. Access has been disabled from Central Command Center."
    logger.warning(f"🔒 [Licensing Push] System suspended immediately by HQ: {reason} (License: {lic_id})")
    return {
        "success": True,
        "is_locked": True,
        "status": "SUSPENDED",
        "license_id": lic_id,
        "reason": reason
    }


@router.post("/restore")
async def restore_remote_license(body: Optional[Dict[str, Any]] = Body(None)):
    """
    Instant push receiver from Central Command Center (HQ).
    Immediately disengages cryptographic lock seal and restores system operations.
    """
    from app.licensing.lockdown import disengage_lock_seal
    disengage_lock_seal()
    license_manager._cached_status = None
    cur = license_manager.validate_license(force_refresh=True)
    logger.info(f"🔓 [Licensing Push] System restored immediately by HQ! Active status: {cur.status}")
    return {
        "success": True,
        "is_locked": cur.is_locked,
        "is_valid": cur.is_valid,
        "status": cur.status,
        "message": "License authority reinstated by Central Command Center."
    }

