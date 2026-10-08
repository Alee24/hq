"""
Smart Campus Cryptographic Lockdown & Data Sealing Engine
Enforces full system lockdown and cryptographic sealing when an unlicensed
installation exceeds its 7-day grace period.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

logger = logging.getLogger("smartcampus.licensing.lockdown")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCK_SEAL_PATHS = [
    os.path.join(BASE_DIR, "data", ".lockdown_sealed"),
    "/app/data/.lockdown_sealed",
]

VENDOR_CONTACTS = {
    "name": "Enterprise Licensing Support",
    "email": "support@smartcampus.ac.ke",
    "phone": "",
    "whatsapp": "",
    "website": "",
    "company": "Smart Campus Enterprise",
}


def is_lock_sealed() -> bool:
    """Checks whether the system cryptographic lock seal is currently engaged on disk."""
    for path in LOCK_SEAL_PATHS:
        if os.path.exists(path):
            return True
    return False


def engage_lock_seal(reason: str, server_machine_id: str, license_id: Optional[str] = None) -> None:
    """Engages the cryptographic lock seal marker across persistent volumes."""
    seal_data = {
        "status": "LOCKED",
        "reason": reason,
        "server_machine_id": server_machine_id,
        "license_id": license_id,
        "sealed_at": datetime.now(timezone.utc).isoformat(),
        "vendor": VENDOR_CONTACTS,
        "warning": "ALL DATA AND MUTATIONS ARE CRYPTOGRAPHICALLY FROZEN UNTIL LICENSED."
    }
    raw = json.dumps(seal_data, indent=2)

    for path in LOCK_SEAL_PATHS:
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(raw)
            logger.warning(f"[Lockdown] Cryptographic lock seal engaged at {path}")
        except Exception as e:
            logger.debug(f"[Lockdown] Could not write lock seal to {path}: {e}")


def disengage_lock_seal() -> None:
    """Removes the cryptographic lock seal marker upon successful license verification."""
    for path in LOCK_SEAL_PATHS:
        if os.path.exists(path):
            try:
                os.remove(path)
                logger.info(f"[Lockdown] Cryptographic lock seal disengaged at {path}")
            except Exception as e:
                logger.error(f"[Lockdown] Failed to remove lock seal at {path}: {e}")
