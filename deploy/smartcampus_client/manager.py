import os
import json
import logging
import math
import time
import socket
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from .fingerprint import get_machine_fingerprint
from .crypto import parse_license_certificate, verify_license_signature
from .lockdown import engage_lock_seal, disengage_lock_seal, is_lock_sealed

logger = logging.getLogger("smartcampus.licensing")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LICENSE_FILE_PATHS = [
    os.path.join(BASE_DIR, "license.lic"),
    os.path.join(BASE_DIR, "data", "license.lic"),
    os.path.join(BASE_DIR, "..", "license.lic"),
    "/app/data/license.lic",
    "/app/license.lic"
]
LEDGER_FILE_PATH = os.path.join(BASE_DIR, "data", ".license_ledger")
GRACE_LEDGER_FILE_PATHS = [
    os.path.join(BASE_DIR, "data", ".license_grace_ledger"),
    "/app/data/.license_grace_ledger",
    os.path.join(BASE_DIR, ".license_grace_ledger")
]

GRACE_PERIOD_DAYS = 7
GRACE_PERIOD_SECONDS = GRACE_PERIOD_DAYS * 86400

VENDOR_EMAIL = "support@smartcampus.ac.ke"
VENDOR_PHONE = ""
VENDOR_WHATSAPP = ""
VENDOR_WEBSITE = ""

# Central Command Center / Licensing Authority
LICENSING_PORTAL_DEFAULT_URL = (
    os.getenv("COMMAND_CENTER_URL")
    or os.getenv("LICENSING_PORTAL_URL")
    or "https://hq.kkdes.co.ke"
).rstrip("/")


def format_countdown_string(seconds: int) -> str:
    """Formats remaining seconds into a human-readable countdown string."""
    if seconds <= 0:
        return "0s"
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60
    if days > 0:
        return f"{days}d {hours:02d}h {mins:02d}m {secs:02d}s"
    if hours > 0:
        return f"{hours:02d}h {mins:02d}m {secs:02d}s"
    return f"{mins:02d}m {secs:02d}s"


class LicenseStatus(BaseModel):
    is_valid: bool = False
    status: str = "UNLICENSED"  # ACTIVE, GRACE_PERIOD, LOCKED, EXPIRED, HARDWARE_MISMATCH, TAMPERED, INVALID_SIGNATURE
    message: str = "System is not licensed. 7-day grace period is active."
    licensee: str = "Unlicensed Evaluation"
    tier: str = "none"
    machine_id: Optional[str] = None
    server_machine_id: str = ""
    expires_at: Optional[str] = None
    days_remaining: int = 0
    is_perpetual: bool = False
    in_grace_period: bool = False
    grace_days_remaining: int = 0
    grace_seconds_remaining: int = 0
    grace_deadline: Optional[str] = None
    is_locked: bool = False
    lock_reason: Optional[str] = None
    contact_email: str = VENDOR_EMAIL
    contact_phone: str = VENDOR_PHONE
    contact_whatsapp: str = VENDOR_WHATSAPP
    contact_website: str = VENDOR_WEBSITE
    max_users: int = 100
    max_gates: int = 2
    modules: List[str] = []
    issued_at: Optional[str] = None
    portal_url: str = LICENSING_PORTAL_DEFAULT_URL
    portal_connected: bool = False
    is_revoked_by_portal: bool = False
    # Central Command Center attributes
    license_id: Optional[str] = None
    installation_limit: int = 1
    product_name: Optional[str] = None
    command_center_connected: bool = False
    command_center_url: str = LICENSING_PORTAL_DEFAULT_URL


class LicenseManager:
    def __init__(self):
        self._cached_status: Optional[LicenseStatus] = None
        self._last_checked: float = 0
        self._cache_ttl_seconds: float = 15.0  # Responsive 15-second recheck for active grace countdown
        self._server_machine_id: str = get_machine_fingerprint()
        self._last_alert_ts: Dict[str, float] = {}

    @property
    def server_machine_id(self) -> str:
        if not self._server_machine_id:
            try:
                self._server_machine_id = get_machine_fingerprint()
            except Exception:
                self._server_machine_id = "SC-AUTO-DETECT-ERROR"
        return self._server_machine_id

    def _check_monotonic_clock(self, now_utc: datetime) -> bool:
        """
        Anti-clock rollback defense: verifies system time has not been wound backward.
        """
        try:
            os.makedirs(os.path.dirname(LEDGER_FILE_PATH), exist_ok=True)
            current_ts = int(now_utc.timestamp())

            if os.path.exists(LEDGER_FILE_PATH):
                with open(LEDGER_FILE_PATH, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        last_recorded_ts = int(content.split(":")[0])
                        # If current time is behind last recorded timestamp by > 1 hour (allow minor NTP drift)
                        if current_ts < (last_recorded_ts - 3600):
                            logger.error(f"[Licensing] Clock tampering detected! Recorded {last_recorded_ts}, current {current_ts}")
                            return False

            # Update monotonic timestamp
            with open(LEDGER_FILE_PATH, "w", encoding="utf-8") as f:
                f.write(f"{current_ts}:{now_utc.isoformat()}")
            return True
        except Exception as e:
            logger.warning(f"[Licensing] Monotonic ledger warning: {e}")
            return True  # Fallback gracefully if filesystem issue

    def _get_grace_ledger_path(self) -> str:
        """Returns primary path to store grace ledger."""
        for p in GRACE_LEDGER_FILE_PATHS:
            if os.path.exists(p):
                return p
        return GRACE_LEDGER_FILE_PATHS[0]

    def _load_grace_ledger(self) -> Optional[Dict[str, Any]]:
        """Loads persistent grace ledger dictionary if available."""
        for p in GRACE_LEDGER_FILE_PATHS:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict) and "first_detected_at" in data:
                            return data
                except Exception as e:
                    logger.debug(f"[Licensing] Could not read grace ledger at {p}: {e}")
        return None

    def _save_grace_ledger(self, data: Dict[str, Any]) -> None:
        """Persists grace ledger across paths to guarantee retention."""
        raw = json.dumps(data, indent=2)
        for p in GRACE_LEDGER_FILE_PATHS[:2]:
            try:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(raw)
            except Exception as e:
                logger.debug(f"[Licensing] Could not save grace ledger to {p}: {e}")

    def _purge_grace_ledger(self) -> None:
        """Removes or marks grace ledger as resolved upon valid license activation."""
        for p in GRACE_LEDGER_FILE_PATHS:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

    def _schedule_unlicensed_alert(self, alert_type: str, reason: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Throttled non-blocking webhook alert dispatch to Command Center."""
        now = time.time()
        last_sent = self._last_alert_ts.get(alert_type, 0)
        # Throttle to once every 30 minutes per alert_type
        if now - last_sent < 1800:
            return
        self._last_alert_ts[alert_type] = now

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.send_unlicensed_alert_webhook(alert_type, reason, metadata))
        except Exception:
            pass

    def _evaluate_unlicensed_grace_period(self, reason: str, server_mid: str, now_utc: datetime) -> LicenseStatus:
        """
        Calculates the tamper-resistant 7-day grace period for unlicensed or invalid installations.
        If within 7 days: status is GRACE_PERIOD, system remains operational with countdown.
        If after 7 days: status is LOCKED, full application and database lockdown engaged.
        """
        current_ts = int(now_utc.timestamp())
        ledger = self._load_grace_ledger()

        if ledger is None:
            # First time detection of unlicensed status — start the 7-day grace countdown
            first_detected = current_ts
            deadline = current_ts + GRACE_PERIOD_SECONDS
            highest_seen = current_ts
            ledger = {
                "first_detected_at": first_detected,
                "deadline_at": deadline,
                "highest_seen_ts": highest_seen,
                "machine_id": server_mid,
                "reason": reason,
                "grace_days": GRACE_PERIOD_DAYS,
                "created_iso": now_utc.isoformat(),
            }
            self._save_grace_ledger(ledger)
            logger.warning(f"[Licensing] Initiated 7-day grace period for node {server_mid}. Deadline: {deadline}")
            self._schedule_unlicensed_alert(
                "UNLICENSED_GRACE_PERIOD_STARTED",
                f"Unlicensed installation detected on node {server_mid}. 7-day evaluation grace started.",
                {"reason": reason, "grace_days": GRACE_PERIOD_DAYS}
            )
        else:
            first_detected = int(ledger.get("first_detected_at", current_ts))
            deadline = int(ledger.get("deadline_at", first_detected + GRACE_PERIOD_SECONDS))
            highest_seen = int(ledger.get("highest_seen_ts", first_detected))

            # Anti-tampering check: clock set backwards
            if current_ts < (highest_seen - 3600):
                logger.error(f"[Licensing] Clock tampering detected in grace ledger! Recorded: {highest_seen}, Current: {current_ts}")
                engage_lock_seal("CLOCK_ROLLBACK_IN_GRACE", server_mid)
                self._schedule_unlicensed_alert(
                    "CLOCK_ROLLBACK_DETECTED",
                    f"Clock tampering detected on node {server_mid}. Clock rolled back from {highest_seen} to {current_ts}.",
                    {"highest_seen": highest_seen, "current_ts": current_ts}
                )
                return LicenseStatus(
                    is_valid=False,
                    status="TAMPERED",
                    is_locked=True,
                    lock_reason="CLOCK_ROLLBACK",
                    message="System clock rollback detected during evaluation period. Operation halted for security.",
                    server_machine_id=server_mid
                )

            # Monotonic advancement
            if current_ts > highest_seen:
                ledger["highest_seen_ts"] = current_ts
                self._save_grace_ledger(ledger)

        seconds_remaining = max(0, deadline - current_ts)
        days_remaining = max(0, math.ceil(seconds_remaining / 86400))
        deadline_dt = datetime.fromtimestamp(deadline, tz=timezone.utc)
        deadline_iso = deadline_dt.isoformat()

        if seconds_remaining > 0:
            # Active 7-Day Grace Period
            disengage_lock_seal()
            countdown_text = format_countdown_string(seconds_remaining)
            msg = (
                f"UNLICENSED EVALUATION MODE: System will automatically lock and encrypt all data in "
                f"{countdown_text} unless licensed. Please contact technical administration "
                f"to activate an enterprise license."
            )
            return LicenseStatus(
                is_valid=True,
                status="GRACE_PERIOD",
                message=msg,
                licensee="Unlicensed 7-Day Evaluation",
                tier="evaluation",
                server_machine_id=server_mid,
                in_grace_period=True,
                grace_days_remaining=days_remaining,
                grace_seconds_remaining=seconds_remaining,
                grace_deadline=deadline_iso,
                days_remaining=days_remaining,
                is_locked=False,
                lock_reason=None,
                max_users=25000,
                max_gates=20,
                modules=["all"],
                command_center_url=LICENSING_PORTAL_DEFAULT_URL,
                portal_url=LICENSING_PORTAL_DEFAULT_URL
            )
        else:
            # 7-Day Grace Period Expired -> FULL LOCKDOWN & DATA SEALING
            engage_lock_seal(f"GRACE_EXPIRED_{reason}", server_mid)
            self._schedule_unlicensed_alert(
                "UNLICENSED_GRACE_PERIOD_EXPIRED",
                f"Grace period expired on node {server_mid}. System locked and tables sealed.",
                {"reason": reason, "first_detected": first_detected, "deadline": deadline}
            )
            msg = (
                f"SYSTEM LOCKED & DATA ENCRYPTED. The 7-day grace period has expired ({reason}). "
                f"All campus operations and database tables have been cryptographically sealed. "
                f"To unlock your system, contact technical administration to activate an enterprise license."
            )
            return LicenseStatus(
                is_valid=False,
                status="LOCKED",
                message=msg,
                licensee="Unlicensed (Locked)",
                tier="none",
                server_machine_id=server_mid,
                in_grace_period=False,
                grace_days_remaining=0,
                grace_seconds_remaining=0,
                grace_deadline=deadline_iso,
                days_remaining=0,
                is_locked=True,
                lock_reason=f"GRACE_EXPIRED_{reason}",
                max_users=0,
                max_gates=0,
                modules=[],
                command_center_url=LICENSING_PORTAL_DEFAULT_URL,
                portal_url=LICENSING_PORTAL_DEFAULT_URL
            )

    def _load_raw_license(self) -> Optional[str]:
        """Loads license string from env, then file, then returns None."""
        # 1. Environment variable
        env_lic = os.getenv("SMARTCAMPUS_LICENSE") or os.getenv("SMARTCAMPUS_LICENSE_KEY") or os.getenv("COMMAND_CENTER_LICENSE")
        if env_lic and env_lic.strip():
            return env_lic.strip()

        # 2. File search
        for path in LICENSE_FILE_PATHS:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                        if content:
                            return content
                except Exception:
                    pass

        return None

    def _get_active_license_id(self) -> Optional[str]:
        """Dynamically retrieves license ID from cached status, raw certificate, or lock seal."""
        if self._cached_status and getattr(self._cached_status, "license_id", None):
            return self._cached_status.license_id

        # 1. Inspect installed license certificate
        try:
            raw_lic = self._load_raw_license()
            if raw_lic:
                parsed = parse_license_certificate(raw_lic)
                if parsed and parsed[0].get("license_id"):
                    return parsed[0].get("license_id")
        except Exception:
            pass

        # 2. Inspect lock seal if present
        try:
            from .lockdown import LOCK_SEAL_PATHS
            for p in LOCK_SEAL_PATHS:
                if os.path.exists(p):
                    with open(p, "r", encoding="utf-8") as f:
                        sd = json.load(f)
                        if sd.get("license_id"):
                            return sd.get("license_id")
        except Exception:
            pass

        return None

    def validate_license(self, raw_cert: Optional[str] = None, force_refresh: bool = False) -> LicenseStatus:
        """
        Full cryptographic and hardware node-locked verification.
        Supports Command Center (https://hq.kkdes.co.ke) multi-block certificates, installation limits,
        7-day unlicensed grace period, countdown ledger, and lockdown sealing.
        Returns a rich LicenseStatus object.
        """
        now = time.time()
        if not force_refresh and self._cached_status and (now - self._last_checked < self._cache_ttl_seconds):
            return self._cached_status

        server_mid = self.server_machine_id
        now_utc = datetime.now(timezone.utc)

        # Anti-Clock Rollback check
        if not self._check_monotonic_clock(now_utc):
            engage_lock_seal("CLOCK_ROLLBACK", server_mid)
            self._schedule_unlicensed_alert("CLOCK_ROLLBACK", "System clock rollback detected on host.", {"machine_id": server_mid})
            status = LicenseStatus(
                is_valid=False,
                status="TAMPERED",
                is_locked=True,
                lock_reason="CLOCK_ROLLBACK",
                message="System clock rollback detected. Operation halted for security.",
                server_machine_id=server_mid
            )
            self._cached_status = status
            self._last_checked = now
            return status

        # Check if Remote Revocation Seal is active on disk
        if is_lock_sealed():
            from .lockdown import LOCK_SEAL_PATHS
            for p in LOCK_SEAL_PATHS:
                if os.path.exists(p):
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            sdata = json.load(f)
                            if sdata.get("reason") == "REVOKED_BY_VENDOR_PORTAL":
                                # Dynamic Restoration Probe: verify if authority was restored on Central Command Center
                                should_probe = force_refresh or (now - getattr(self, "_last_recheck_probe_time", 0) >= 3.0)
                                if should_probe:
                                    self._last_recheck_probe_time = now
                                    try:
                                        import httpx
                                        lic_id = self._get_active_license_id() or sdata.get("license_id")
                                        url = (
                                            os.getenv("COMMAND_CENTER_URL")
                                            or os.getenv("LICENSING_PORTAL_URL", LICENSING_PORTAL_DEFAULT_URL)
                                        ).rstrip("/")
                                        probe_payload = {
                                            "machine_id": server_mid,
                                            "license_id": lic_id,
                                            "hostname": socket.gethostname(),
                                            "status": "VALIDATE_PROBE"
                                        }
                                        with httpx.Client(timeout=2.0, verify=False) as probe_client:
                                            pr = probe_client.post(f"{url}/api/v1/licenses/heartbeat", json=probe_payload)
                                            if pr.status_code == 200:
                                                pdata = pr.json()
                                                if not pdata.get("is_revoked"):
                                                    # AUTHORITY RESTORED! DISENGAGE LOCK SEAL IMMEDIATELY!
                                                    disengage_lock_seal()
                                                    self._cached_status = None
                                                    logger.info(f"✨ [Licensing] Remote restoration confirmed from {url}! Disengaged lockdown seal.")
                                                    break
                                    except Exception as probe_err:
                                        logger.debug(f"[Licensing] Synchronous reactivation probe non-fatal error: {probe_err}")

                                if is_lock_sealed():
                                    status = LicenseStatus(
                                        is_valid=False,
                                        status="LOCKED",
                                        is_locked=True,
                                        is_revoked_by_portal=True,
                                        lock_reason="REVOKED_BY_VENDOR_PORTAL",
                                        license_id=self._get_active_license_id() or sdata.get("license_id"),
                                        message=(
                                            f"SYSTEM SUSPENDED: License has been remotely suspended by software vendor. "
                                            f"Please contact technical administration to restore activation."
                                        ),
                                        server_machine_id=server_mid,
                                        command_center_url=LICENSING_PORTAL_DEFAULT_URL,
                                        portal_url=LICENSING_PORTAL_DEFAULT_URL
                                    )
                                    self._cached_status = status
                                    self._last_checked = now
                                    return status
                    except Exception:
                        pass

        # Load license certificate
        license_str = raw_cert or self._load_raw_license()
        if not license_str:
            status = self._evaluate_unlicensed_grace_period("NO_LICENSE", server_mid, now_utc)
            self._cached_status = status
            self._last_checked = now
            return status

        # Parse Envelope
        parsed = parse_license_certificate(license_str)
        if not parsed:
            status = self._evaluate_unlicensed_grace_period("CORRUPTED_CERTIFICATE", server_mid, now_utc)
            self._cached_status = status
            self._last_checked = now
            return status

        payload, signature = parsed

        # Cryptographic Signature Verification (Ed25519)
        if not verify_license_signature(payload, signature):
            self._schedule_unlicensed_alert(
                "INVALID_SIGNATURE",
                "License certificate signature verification failed.",
                {"license_id": payload.get("license_id"), "customer": payload.get("customer") or payload.get("customer_name")}
            )
            status = self._evaluate_unlicensed_grace_period("INVALID_SIGNATURE", server_mid, now_utc)
            self._cached_status = status
            self._last_checked = now
            return status

        # Hardware Node-Lock Verification (Machine ID)
        lic_mid = payload.get("machine_id", "").strip().upper() if payload.get("machine_id") else ""
        # If a specific machine_id is specified (and not wildcard '*'), enforce single-node locking.
        # If machine_id is omitted or '*', this is a multi-node Command Center license managed by installation_limit.
        if lic_mid and lic_mid != "*" and lic_mid != server_mid:
            self._schedule_unlicensed_alert(
                "HARDWARE_MISMATCH",
                f"License bound to {lic_mid}, but running on {server_mid}.",
                {"expected_machine_id": lic_mid, "server_machine_id": server_mid, "license_id": payload.get("license_id")}
            )
            status = self._evaluate_unlicensed_grace_period(
                f"HARDWARE_MISMATCH_EXPECTED_{lic_mid}",
                server_mid,
                now_utc
            )
            status.machine_id = lic_mid
            status.licensee = payload.get("customer") or payload.get("customer_name") or "Unknown"
            self._cached_status = status
            self._last_checked = now
            return status

        # Expiration Date Verification
        expires_at_str = payload.get("expires_at")
        grace_days = int(payload.get("grace_period_days", 7))

        if expires_at_str:
            try:
                # Parse ISO date/datetime
                exp_clean = expires_at_str.replace("Z", "+00:00")
                if "T" in exp_clean:
                    exp_dt = datetime.fromisoformat(exp_clean)
                else:
                    exp_dt = datetime.strptime(exp_clean, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            except Exception:
                exp_dt = datetime(2099, 1, 1, tzinfo=timezone.utc)
        else:
            exp_dt = datetime(2099, 1, 1, tzinfo=timezone.utc)

        time_left = exp_dt - now_utc
        days_remaining = time_left.days

        # Normalization of Command Center payload fields
        cust_name = payload.get("customer") or payload.get("customer_name") or "Enterprise Campus"
        tier_val = (payload.get("type") or payload.get("tier") or "enterprise").lower()
        lic_id = payload.get("license_id")
        inst_limit = int(payload.get("installation_limit") or payload.get("max_installations") or 1)
        prod_name = payload.get("product") or "Enterprise Software Suite"

        # Features normalization
        raw_feat = payload.get("features")
        if isinstance(raw_feat, list):
            modules_list = raw_feat
        elif isinstance(raw_feat, dict) and raw_feat:
            modules_list = [k for k, v in raw_feat.items() if v]
        else:
            modules_list = payload.get("modules", ["all"])

        # Expired check with 7-day Grace Period
        if now_utc > exp_dt:
            grace_deadline = exp_dt + timedelta(days=grace_days)
            if now_utc <= grace_deadline:
                disengage_lock_seal()
                grace_remaining_seconds = max(0, int((grace_deadline - now_utc).total_seconds()))
                grace_remaining_days = max(0, math.ceil(grace_remaining_seconds / 86400))
                countdown_text = format_countdown_string(grace_remaining_seconds)
                msg = (
                    f"LICENSE EXPIRED on {exp_dt.strftime('%d %b %Y')}. System is operating in a "
                    f"{grace_days}-day Grace Period ({countdown_text} remaining). Automatic lockdown and "
                    f"data encryption will occur if not renewed. Please contact technical administration."
                )
                status = LicenseStatus(
                    is_valid=True,
                    status="GRACE_PERIOD",
                    in_grace_period=True,
                    grace_days_remaining=grace_remaining_days,
                    grace_seconds_remaining=grace_remaining_seconds,
                    grace_deadline=grace_deadline.isoformat(),
                    message=msg,
                    licensee=cust_name,
                    tier=tier_val,
                    machine_id=lic_mid or server_mid,
                    server_machine_id=server_mid,
                    expires_at=exp_dt.isoformat(),
                    days_remaining=0,
                    is_locked=False,
                    max_users=int(payload.get("max_users", 25000)),
                    max_gates=int(payload.get("max_gates", 20)),
                    modules=modules_list,
                    issued_at=payload.get("issued_at"),
                    license_id=lic_id,
                    installation_limit=inst_limit,
                    product_name=prod_name,
                    command_center_url=LICENSING_PORTAL_DEFAULT_URL,
                    command_center_connected=self._cached_status.command_center_connected if self._cached_status else False,
                    portal_url=LICENSING_PORTAL_DEFAULT_URL,
                    portal_connected=self._cached_status.portal_connected if self._cached_status else False
                )
                self._cached_status = status
                self._last_checked = now
                return status
            else:
                engage_lock_seal("EXPIRED_AND_GRACE_ELAPSED", server_mid)
                self._schedule_unlicensed_alert(
                    "LICENSE_EXPIRED_LOCKDOWN",
                    f"License {lic_id} expired on {exp_dt.isoformat()} and grace period elapsed. System locked.",
                    {"license_id": lic_id, "customer": cust_name}
                )
                msg = (
                    f"SYSTEM LOCKED & DATA ENCRYPTED. License and grace period expired on "
                    f"{grace_deadline.strftime('%d %b %Y')}. All campus operations and database tables "
                    f"are sealed until renewed. Please contact technical administration immediately."
                )
                status = LicenseStatus(
                    is_valid=False,
                    status="LOCKED",
                    is_locked=True,
                    lock_reason="EXPIRED_AND_GRACE_ELAPSED",
                    message=msg,
                    licensee=cust_name,
                    tier=tier_val,
                    machine_id=lic_mid or server_mid,
                    server_machine_id=server_mid,
                    expires_at=exp_dt.isoformat(),
                    days_remaining=days_remaining,
                    max_users=0,
                    max_gates=0,
                    modules=[],
                    issued_at=payload.get("issued_at"),
                    license_id=lic_id,
                    installation_limit=inst_limit,
                    product_name=prod_name,
                    command_center_url=LICENSING_PORTAL_DEFAULT_URL,
                    command_center_connected=False,
                    portal_url=LICENSING_PORTAL_DEFAULT_URL,
                    portal_connected=False
                )
                self._cached_status = status
                self._last_checked = now
                return status

        # Active & Fully Valid
        disengage_lock_seal()
        self._purge_grace_ledger()

        is_perpetual = bool(payload.get("is_perpetual")) or tier_val == "lifetime" or exp_dt.year >= 2090 or days_remaining > 3650
        status_tier = "lifetime" if (is_perpetual and tier_val in ["enterprise", "lifetime", "none"]) else tier_val

        status = LicenseStatus(
            is_valid=True,
            status="ACTIVE",
            message=f"Lifetime Enterprise License is permanently certified for '{cust_name}'." if is_perpetual else f"License is active and certified for '{cust_name}'.",
            licensee=cust_name,
            tier=status_tier,
            machine_id=lic_mid or server_mid,
            server_machine_id=server_mid,
            expires_at="2099-12-31" if is_perpetual else exp_dt.isoformat(),
            days_remaining=999999 if is_perpetual else max(0, days_remaining),
            is_perpetual=is_perpetual,
            in_grace_period=False,
            is_locked=False,
            max_users=int(payload.get("max_users", 25000)),
            max_gates=int(payload.get("max_gates", 20)),
            modules=modules_list,
            issued_at=payload.get("issued_at"),
            license_id=lic_id,
            installation_limit=inst_limit,
            product_name=prod_name,
            command_center_url=LICENSING_PORTAL_DEFAULT_URL,
            command_center_connected=self._cached_status.command_center_connected if self._cached_status else False,
            portal_url=LICENSING_PORTAL_DEFAULT_URL,
            portal_connected=self._cached_status.portal_connected if self._cached_status else False
        )
        self._cached_status = status
        self._last_checked = now
        return status

    def activate_license(self, raw_cert: str) -> LicenseStatus:
        """
        Validates the license certificate, writes it to disk, and updates memory cache.
        Triggers asynchronous connect-back callback to Central Command Center.
        """
        status = self.validate_license(raw_cert=raw_cert, force_refresh=True)
        if not status.is_valid or status.status != "ACTIVE":
            return status

        # Remove lock seal & grace ledger immediately
        disengage_lock_seal()
        self._purge_grace_ledger()

        # Save to primary license file path
        target_path = LICENSE_FILE_PATHS[1]  # data/license.lic
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(raw_cert.strip() + "\n")
            logger.info(f"[Licensing] Saved activated license to {target_path}")
        except Exception as e:
            # Fallback to root license.lic
            try:
                with open(LICENSE_FILE_PATHS[0], "w", encoding="utf-8") as f:
                    f.write(raw_cert.strip() + "\n")
            except Exception as ex2:
                logger.error(f"[Licensing] Failed to persist license file: {ex2}")

        self._cached_status = status
        self._last_checked = time.time()

        # Trigger asynchronous connect-back to Command Center
        try:
            import asyncio
            parsed = parse_license_certificate(raw_cert)
            payload = parsed[0] if parsed else {}
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.report_activation_to_command_center(payload))
        except Exception as cb_err:
            logger.debug(f"[Licensing] Could not schedule connect-back callback: {cb_err}")

        return status

    def is_module_enabled(self, module_name: str) -> bool:
        """Checks if a specific feature module is permitted by the active license."""
        status = self.validate_license()
        if not status.is_valid:
            return False
        if "all" in status.modules or "*" in status.modules:
            return True
        return module_name.lower() in [m.lower() for m in status.modules]

    async def report_activation_to_command_center(
        self,
        license_payload: Optional[Dict[str, Any]] = None,
        portal_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Connects back to the Central Command Center (https://hq.kkdes.co.ke) to notify that
        the license was activated on this instance.
        Reports license_id, machine fingerprint, customer name, domain/hostname, and activation timestamp.
        """
        import httpx
        url = (portal_url or os.getenv("COMMAND_CENTER_URL") or os.getenv("LICENSING_PORTAL_URL", LICENSING_PORTAL_DEFAULT_URL)).rstrip("/")
        endpoints = [
            f"{url}/api/v1/licenses/activate",
            f"{url}/api/v1/client/activate"
        ]

        mid = self.server_machine_id
        hostname = socket.gethostname()

        st = self._cached_status
        p = license_payload or {}

        lic_id = p.get("license_id") or (getattr(st, "license_id", None) if st else None)
        customer = p.get("customer") or p.get("customer_name") or (st.licensee if st else "Campus Node")
        admin_email = p.get("email") or p.get("admin_email") or p.get("customer_email")
        inst_limit = int(p.get("installation_limit") or getattr(st, "installation_limit", 1) or 1)

        body = {
            "license_id": lic_id,
            "machine_id": mid,
            "customer": customer,
            "client_name": customer,
            "admin_email": admin_email,
            "hostname": hostname,
            "app_name": "Smart Campus GatePass & Access Suite",
            "app_version": p.get("version", "v1.0.0"),
            "product": p.get("product", "Enterprise Software Suite"),
            "installation_limit": inst_limit,
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "status": "ACTIVE"
        }

        for ep in endpoints:
            try:
                async with httpx.AsyncClient(timeout=6.0, verify=False) as client:
                    resp = await client.post(ep, json=body)
                    if resp.status_code in [200, 201]:
                        data = resp.json()
                        logger.info(f"[Licensing] Connect-back activation acknowledged by Command Center: {ep}")
                        if self._cached_status:
                            self._cached_status.command_center_connected = True
                            self._cached_status.portal_connected = True
                        return {"success": True, "connected": True, "response": data, "portal_url": url}
                    elif resp.status_code == 403:
                        # License revoked by HQ
                        data = resp.json()
                        engage_lock_seal("REVOKED_BY_VENDOR_PORTAL", mid)
                        return {"success": False, "is_revoked": True, "error": data.get("detail", "Revoked by Command Center")}
            except Exception as e:
                logger.debug(f"[Licensing] Connect-back attempt to {ep} failed: {e}")

        # If portal is offline/unreachable right now, return cleanly without throwing
        return {
            "success": True,
            "connected": False,
            "portal_url": url,
            "note": "Command Center temporarily offline; operating in resilient standalone mode."
        }

    async def send_unlicensed_alert_webhook(
        self,
        alert_type: str,
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
        portal_url: Optional[str] = None
    ) -> bool:
        """
        Sends an immediate telemetry alert to Central Command Center (https://hq.kkdes.co.ke)
        when an unlicensed installation runs, grace period is triggered, or tampering is detected.
        """
        import httpx
        url = (portal_url or os.getenv("COMMAND_CENTER_URL") or os.getenv("LICENSING_PORTAL_URL", LICENSING_PORTAL_DEFAULT_URL)).rstrip("/")
        endpoints = [
            f"{url}/api/v1/licenses/telemetry-alert",
            f"{url}/api/v1/client/telemetry-alert",
            f"{url}/api/v1/telemetry-alert"
        ]

        hostname = socket.gethostname()
        mid = self.server_machine_id

        payload = {
            "event": "UNLICENSED_TELEMETRY_ALERT",
            "alert_type": alert_type,
            "machine_id": mid,
            "hostname": hostname,
            "reason": reason,
            "detected_at": datetime.now(timezone.utc).isoformat(),
            "app_name": "Smart Campus GatePass & Access Suite",
            "app_version": "v1.0.0",
            "details": metadata or {}
        }

        for ep in endpoints:
            try:
                async with httpx.AsyncClient(timeout=4.0, verify=False) as client:
                    resp = await client.post(ep, json=payload)
                    if resp.status_code in [200, 201, 204]:
                        logger.info(f"[Licensing] Telemetry alert successfully delivered to Command Center: {ep}")
                        return True
            except Exception as e:
                logger.debug(f"[Licensing] Webhook ping to {ep} failed: {e}")

        return False

    async def activate_via_portal(
        self,
        client_name: str,
        admin_email: Optional[str] = None,
        license_key: Optional[str] = None,
        portal_url: Optional[str] = None
    ) -> LicenseStatus:
        """
        Connects to the Central Licensing Vendor Portal to activate and register this installation.
        Cryptographically validates the returned certificate token and writes it locally.
        """
        import httpx
        url = (portal_url or os.getenv("COMMAND_CENTER_URL") or os.getenv("LICENSING_PORTAL_URL", LICENSING_PORTAL_DEFAULT_URL)).rstrip("/")
        endpoint = f"{url}/api/v1/client/activate"
        mid = self.server_machine_id

        payload = {
            "machine_id": mid,
            "client_name": client_name,
            "admin_email": admin_email,
            "license_key": license_key,
            "app_version": "v1.0.0"
        }

        try:
            async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                resp = await client.post(endpoint, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    cert_or_token = data.get("license_token") or data.get("certificate")
                    if not cert_or_token:
                        raise ValueError("Central portal did not return a valid license token.")
                    status = self.activate_license(cert_or_token)
                    status.portal_connected = True
                    status.command_center_connected = True
                    status.portal_url = url
                    status.command_center_url = url
                    return status
                elif resp.status_code == 403:
                    data = resp.json()
                    detail = data.get("detail", "License revoked by vendor.")
                    engage_lock_seal("REVOKED_BY_VENDOR_PORTAL", mid)
                    self._cached_status = None
                    status = self.validate_license(force_refresh=True)
                    status.is_locked = True
                    status.is_revoked_by_portal = True
                    status.lock_reason = "REVOKED_BY_VENDOR_PORTAL"
                    status.message = detail
                    return status
                else:
                    raise ValueError(f"Portal returned HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(f"[Licensing] Online activation via portal ({endpoint}) failed: {e}")
            raise

    async def check_portal_heartbeat(self, portal_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Periodic phone-home heartbeat to the central portal (every 6h or on manual verification).
        Enforces remote revocation if triggered by vendor.
        """
        import httpx
        url = (portal_url or os.getenv("COMMAND_CENTER_URL") or os.getenv("LICENSING_PORTAL_URL", LICENSING_PORTAL_DEFAULT_URL)).rstrip("/")
        endpoints = [
            f"{url}/api/v1/licenses/heartbeat",
            f"{url}/api/v1/client/heartbeat"
        ]
        mid = self.server_machine_id
        lic_id = self._get_active_license_id()

        payload = {
            "machine_id": mid,
            "license_id": lic_id,
            "client_name": self._cached_status.licensee if self._cached_status else "Campus Node",
            "customer": self._cached_status.licensee if self._cached_status else "Campus Node",
            "app_version": "v1.0.0",
            "hostname": socket.gethostname(),
            "status": self._cached_status.status if self._cached_status else "ACTIVE"
        }

        for ep in endpoints:
            try:
                async with httpx.AsyncClient(timeout=6.0, verify=False) as client:
                    resp = await client.post(ep, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("is_revoked"):
                            # Remote Kill-Switch Enforced!
                            reason = data.get("reason", "Revoked by Central Licensing Portal")
                            logger.error(f"[Licensing] REMOTE REVOCATION ENFORCED FROM VENDOR PORTAL: {reason}")
                            engage_lock_seal("REVOKED_BY_VENDOR_PORTAL", mid, license_id=lic_id)
                            self._cached_status = None
                            cur = self.validate_license(force_refresh=True)
                            cur.is_locked = True
                            cur.is_revoked_by_portal = True
                            cur.lock_reason = "REVOKED_BY_VENDOR_PORTAL"
                            return {"success": False, "is_revoked": True, "reason": reason}
                        else:
                            # Heartbeat success - Authority verified or restored!
                            disengage_lock_seal()
                            self._cached_status = None
                            fresh_status = self.validate_license(force_refresh=True)
                            if self._cached_status:
                                self._cached_status.portal_connected = True
                                self._cached_status.command_center_connected = True
                            logger.info(f"✨ [Licensing] Remote authorization active from {url}. Status: {fresh_status.status}")
                            return {
                                "success": True,
                                "is_valid": fresh_status.is_valid,
                                "is_revoked": False,
                                "reactivated": True,
                                "portal_url": url,
                                "status": fresh_status.status
                            }
                    elif resp.status_code == 403:
                        engage_lock_seal("REVOKED_BY_VENDOR_PORTAL", mid, license_id=lic_id)
                        self._cached_status = None
                        return {"success": False, "is_revoked": True, "reason": "Revoked by vendor portal"}
            except Exception as e:
                logger.debug(f"[Licensing] Central portal heartbeat unreachable at {ep}: {e}")

        return {"success": False, "offline": True, "portal_url": url, "message": "Command Center currently unreachable"}


# Singleton instance
license_manager = LicenseManager()
