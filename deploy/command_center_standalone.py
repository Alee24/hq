"""
KKDES Central Software Command Center
Domain: https://hq.kkdes.co.ke/
Owner & Authority: Metto Alex (KKDES Software Solutions)
"""

import os
import sys
import sqlite3
import base64
import json
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, Response
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("command_center")

app = FastAPI(title="KKDES Central Software Command Center", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "command_center.db")
KEY_FILE = os.path.join(BASE_DIR, "command_center_key.pem")

# Official Vendor Master Private Key
DEFAULT_VENDOR_PRIVATE_KEY_PEM = (
    "-----BEGIN PRIVATE KEY-----\n"
    "MC4CAQAwBQYDK2VwBCIEIG0WQ3msm2XaQy/3/mFSitS33lqPN7sxj6tj4mBf+kgd\n"
    "-----END PRIVATE KEY-----\n"
)

# ==============================================================================
# 1. Database Initialization & Pre-seeding
# ==============================================================================

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS licenses (
            license_id TEXT PRIMARY KEY,
            customer TEXT NOT NULL,
            email TEXT,
            product TEXT NOT NULL,
            type TEXT DEFAULT 'Enterprise',
            installation_limit INTEGER DEFAULT 1,
            issued_at TEXT,
            expires_at TEXT,
            features TEXT DEFAULT '{}',
            is_revoked INTEGER DEFAULT 0,
            revocation_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_id TEXT NOT NULL,
            machine_id TEXT NOT NULL,
            customer TEXT,
            client_name TEXT,
            hostname TEXT,
            ip_address TEXT,
            app_name TEXT,
            app_version TEXT,
            activated_at TEXT NOT NULL,
            last_heartbeat TEXT NOT NULL,
            status TEXT DEFAULT 'ACTIVE',
            UNIQUE(license_id, machine_id),
            FOREIGN KEY(license_id) REFERENCES licenses(license_id)
        );

        CREATE TABLE IF NOT EXISTS telemetry_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_type TEXT NOT NULL,
            machine_id TEXT,
            hostname TEXT,
            ip_address TEXT,
            reason TEXT,
            detected_at TEXT NOT NULL,
            app_name TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Pre-seed sample enterprise license: LIC-2026-190548
        sample_lic = conn.execute("SELECT * FROM licenses WHERE license_id = 'LIC-2026-190548'").fetchone()
        if not sample_lic:
            conn.execute("""
                INSERT INTO licenses (
                    license_id, customer, email, product, type, installation_limit,
                    issued_at, expires_at, features, is_revoked, revocation_reason
                ) VALUES (
                    'LIC-2026-190548', 'RU Smart Campus', 'ametto@ru.ac.ke', 'Enterprise Software Suite',
                    'Enterprise', 5, '2026-10-08T14:54:00Z', '2027-10-08T14:54:00Z', '{}', 0, NULL
                )
            """)
            conn.commit()
            logger.info("Pre-seeded master sample license LIC-2026-190548.")

init_db()

# ==============================================================================
# 2. Cryptographic Keys (Ed25519)
# ==============================================================================

def get_or_create_keys():
    """Loads existing Ed25519 private key from disk or initializes the master vendor key."""
    if os.path.exists(KEY_FILE):
        try:
            with open(KEY_FILE, "rb") as f:
                priv = serialization.load_pem_private_key(f.read(), password=None)
                pub = priv.public_key()
                logger.info("Loaded master key from disk.")
                return priv, pub
        except Exception as e:
            logger.error(f"Error loading existing key file: {e}")

    try:
        priv = serialization.load_pem_private_key(DEFAULT_VENDOR_PRIVATE_KEY_PEM.encode("utf-8"), password=None)
        pub = priv.public_key()
        with open(KEY_FILE, "wb") as f:
            f.write(priv.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        logger.info(f"Initialized official vendor private key at {KEY_FILE}")
        return priv, pub
    except Exception as e:
        logger.warning(f"Could not initialize master vendor key, generating fresh key: {e}")
        priv = ed25519.Ed25519PrivateKey.generate()
        pub = priv.public_key()
        return priv, pub

priv_key, pub_key = get_or_create_keys()

spki_pub_bytes = pub_key.public_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PublicFormat.SubjectPublicKeyInfo
)
spki_pub_b64 = base64.b64encode(spki_pub_bytes).decode('utf-8')

raw_pub_bytes = pub_key.public_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PublicFormat.Raw
)
raw_pub_b64 = base64.b64encode(raw_pub_bytes).decode('utf-8')

# Canonical deterministic JSON bytes
def canonical_json_bytes(data: Dict[str, Any]) -> bytes:
    clean = {k: v for k, v in data.items() if not str(k).startswith("_")}
    return json.dumps(clean, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

# ==============================================================================
# 3. Real-Time WebSocket Connection Hub
# ==============================================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total connected clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

ws_manager = ConnectionManager()

def broadcast_sync(message: dict):
    """Safely dispatches WebSocket broadcast even from synchronous endpoint threads."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(ws_manager.broadcast(message))
    except Exception as e:
        logger.debug(f"Broadcast dispatch exception: {e}")

@app.websocket("/ws")
async def websocket_hub(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        with get_db() as conn:
            total_lic = conn.execute("SELECT COUNT(*) as c FROM licenses").fetchone()["c"]
            total_act = conn.execute("SELECT COUNT(*) as c FROM activations WHERE status = 'ACTIVE'").fetchone()["c"]
            total_alt = conn.execute("SELECT COUNT(*) as c FROM telemetry_alerts").fetchone()["c"]

        await websocket.send_json({
            "type": "INITIAL_SNAPSHOT",
            "data": {
                "total_licenses": total_lic,
                "total_nodes": total_act,
                "total_alerts": total_alt,
                "authority": "https://hq.kkdes.co.ke",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        })

        while True:
            text = await websocket.receive_text()
            if text == "ping":
                await websocket.send_text("pong")
            else:
                try:
                    payload = json.loads(text)
                    if payload.get("type") == "ping":
                        await websocket.send_json({"type": "pong", "time": datetime.now(timezone.utc).isoformat()})
                except Exception:
                    pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket lifecycle exception: {e}")
        ws_manager.disconnect(websocket)

# ==============================================================================
# 4. Request & Response Schemas
# ==============================================================================

class ActivateRequest(BaseModel):
    license_id: str
    machine_id: str
    customer: Optional[str] = None
    client_name: Optional[str] = None
    admin_email: Optional[str] = None
    hostname: Optional[str] = None
    app_name: Optional[str] = "Smart Campus GatePass & Access Suite"
    app_version: Optional[str] = "v1.0.0"
    product: Optional[str] = "Enterprise Software Suite"
    installation_limit: Optional[int] = 1
    activated_at: Optional[str] = None
    status: Optional[str] = "ACTIVE"

class HeartbeatRequest(BaseModel):
    license_id: Optional[str] = None
    machine_id: str
    client_name: Optional[str] = None
    customer: Optional[str] = None
    hostname: Optional[str] = None
    app_version: Optional[str] = None

class TelemetryAlertRequest(BaseModel):
    alert_type: str
    machine_id: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    reason: Optional[str] = None
    detected_at: Optional[str] = None
    app_name: Optional[str] = None
    details: Optional[Any] = None

class GenerateLicenseRequest(BaseModel):
    customer: str
    email: str
    product: Optional[str] = "Enterprise Software Suite"
    type: Optional[str] = "Enterprise"
    installation_limit: int = 5
    expires_in_days: int = 365
    features: Optional[Dict[str, Any]] = None

class RevokeRequest(BaseModel):
    reason: Optional[str] = "Revoked by vendor administrator"
    action: Optional[str] = "revoke"

# ==============================================================================
# 5. Core API Endpoints
# ==============================================================================

@app.get("/health")
@app.get("/api/health")
@app.get("/api/v1/licenses/health")
def health():
    return {
        "status": "ok",
        "service": "Central Software Command Center",
        "vendor": "Metto Alex",
        "authority": "https://hq.kkdes.co.ke",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/auth/me")
def auth_me():
    return {
        "id": 1,
        "username": "mettoalex",
        "email": "mettoalex@gmail.com",
        "full_name": "Metto Alex",
        "role": "SUPER_ADMIN",
        "is_active": True,
        "is_superuser": True
    }

@app.get("/robots.txt", response_class=PlainTextResponse)
def robots_txt():
    return "User-agent: *\nDisallow: /api/\nDisallow: /ws\nAllow: /\n"

@app.get("/favicon.ico")
def favicon():
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
    return Response(content=svg, media_type="image/svg+xml")

@app.post("/api/v1/licenses/activate")
@app.post("/api/v1/client/activate")
def client_activate(req: ActivateRequest, request: Request):
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "127.0.0.1")
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        lic = conn.execute("SELECT * FROM licenses WHERE license_id = ?", (req.license_id,)).fetchone()
        if not lic:
            # Auto-enroll license if missing from prior offline generation
            conn.execute("""
                INSERT OR IGNORE INTO licenses (
                    license_id, customer, email, product, type, installation_limit, issued_at, expires_at
                ) VALUES (?, ?, ?, ?, 'Enterprise', ?, ?, ?)
            """, (
                req.license_id, req.customer or "Enterprise Customer",
                req.admin_email or "", req.product or "Enterprise Suite",
                req.installation_limit or 5, now_iso, "2099-12-31T23:59:59Z"
            ))
            conn.commit()
            lic = conn.execute("SELECT * FROM licenses WHERE license_id = ?", (req.license_id,)).fetchone()

        if lic["is_revoked"] == 1:
            raise HTTPException(
                status_code=403,
                detail=f"License {req.license_id} has been revoked by vendor: {lic['revocation_reason'] or 'Revoked by authority'}"
            )

        # Check existing machine activation
        existing = conn.execute(
            "SELECT * FROM activations WHERE license_id = ? AND machine_id = ?",
            (req.license_id, req.machine_id)
        ).fetchone()

        total_active = conn.execute(
            "SELECT COUNT(*) as count FROM activations WHERE license_id = ? AND status = 'ACTIVE'",
            (req.license_id,)
        ).fetchone()["count"]

        limit = lic["installation_limit"] or 1

        if not existing:
            if total_active >= limit:
                raise HTTPException(
                    status_code=403,
                    detail=f"Installation limit exceeded ({total_active}/{limit} nodes in use). Contact Metto Alex to expand quota."
                )

            conn.execute("""
                INSERT INTO activations (
                    license_id, machine_id, customer, client_name, hostname,
                    ip_address, app_name, app_version, activated_at, last_heartbeat, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            """, (
                req.license_id, req.machine_id, req.customer or lic["customer"],
                req.client_name, req.hostname, client_ip, req.app_name,
                req.app_version, req.activated_at or now_iso, now_iso
            ))
            conn.commit()
            total_active += 1
        else:
            conn.execute("""
                UPDATE activations
                SET last_heartbeat = ?, ip_address = ?, hostname = ?, status = 'ACTIVE'
                WHERE license_id = ? AND machine_id = ?
            """, (now_iso, client_ip, req.hostname, req.license_id, req.machine_id))
            conn.commit()

    # Broadcast event via WebSocket
    broadcast_sync({
        "type": "ACTIVATION_UPDATE",
        "data": {
            "license_id": req.license_id,
            "machine_id": req.machine_id,
            "customer": req.customer or lic["customer"],
            "hostname": req.hostname,
            "ip_address": client_ip,
            "installations_used": total_active,
            "installation_limit": limit,
            "timestamp": now_iso
        }
    })

    return {
        "status": "activated",
        "license_id": req.license_id,
        "customer": req.customer or lic["customer"],
        "machine_id": req.machine_id,
        "installations_used": total_active,
        "installation_limit": limit,
        "message": "Activation acknowledged and recorded on Command Center."
    }

@app.post("/api/v1/licenses/heartbeat")
@app.post("/api/v1/client/heartbeat")
def client_heartbeat(req: HeartbeatRequest, request: Request):
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "127.0.0.1")
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        if req.license_id:
            lic = conn.execute("SELECT * FROM licenses WHERE license_id = ?", (req.license_id,)).fetchone()
            if lic and lic["is_revoked"] == 1:
                return {
                    "is_revoked": True,
                    "reason": lic["revocation_reason"] or "Revoked by vendor administrator."
                }

            conn.execute("""
                UPDATE activations
                SET last_heartbeat = ?, ip_address = ?, hostname = COALESCE(?, hostname)
                WHERE license_id = ? AND machine_id = ?
            """, (now_iso, client_ip, req.hostname, req.license_id, req.machine_id))
            conn.commit()

    return {"status": "ok", "is_valid": True, "is_revoked": False}

@app.post("/api/v1/licenses/telemetry-alert")
@app.post("/api/v1/client/telemetry-alert")
@app.post("/api/v1/telemetry-alert")
def client_telemetry_alert(req: TelemetryAlertRequest, request: Request):
    client_ip = req.ip_address or request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "127.0.0.1")
    now_iso = datetime.now(timezone.utc).isoformat()
    details_str = json.dumps(req.details) if isinstance(req.details, (dict, list)) else str(req.details or "{}")

    with get_db() as conn:
        conn.execute("""
            INSERT INTO telemetry_alerts (
                alert_type, machine_id, hostname, ip_address, reason,
                detected_at, app_name, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.alert_type, req.machine_id, req.hostname, client_ip,
            req.reason, req.detected_at or now_iso, req.app_name, details_str
        ))
        conn.commit()

    logger.warning(f"🚨 [TELEMETRY ALERT] {req.alert_type} from {client_ip} ({req.hostname}) - {req.reason}")

    # Broadcast alert over WebSocket
    broadcast_sync({
        "type": "TELEMETRY_ALERT",
        "data": {
            "alert_type": req.alert_type,
            "machine_id": req.machine_id,
            "hostname": req.hostname,
            "ip_address": client_ip,
            "reason": req.reason,
            "timestamp": now_iso
        }
    })

    return {"status": "recorded", "alert_type": req.alert_type}

@app.post("/api/v1/licenses/generate")
def generate_license(req: GenerateLicenseRequest):
    now_utc = datetime.now(timezone.utc)
    exp_utc = now_utc + timedelta(days=req.expires_in_days)
    lic_id = f"LIC-{now_utc.year}-{uuid.uuid4().hex[:6].upper()}"

    payload = {
        "customer": req.customer,
        "email": req.email,
        "expires_at": exp_utc.isoformat(),
        "features": req.features or {},
        "installation_limit": req.installation_limit,
        "issued_at": now_utc.isoformat(),
        "license_id": lic_id,
        "product": req.product,
        "type": req.type,
        "version": "v1.0.0"
    }

    canonical_bytes = canonical_json_bytes(payload)
    sig_bytes = priv_key.sign(canonical_bytes)
    sig_b64 = base64.b64encode(sig_bytes).decode('utf-8')
    payload_b64 = base64.b64encode(json.dumps(payload, separators=(',', ':')).encode('utf-8')).decode('utf-8')

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

    with get_db() as conn:
        conn.execute("""
            INSERT INTO licenses (
                license_id, customer, email, product, type, installation_limit,
                issued_at, expires_at, features, is_revoked, revocation_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
        """, (
            lic_id, req.customer, req.email, req.product, req.type,
            req.installation_limit, now_utc.isoformat(), exp_utc.isoformat(),
            json.dumps(req.features or {})
        ))
        conn.commit()

    broadcast_sync({
        "type": "LICENSE_GENERATED",
        "data": {
            "license_id": lic_id,
            "customer": req.customer,
            "limit": req.installation_limit
        }
    })

    return {
        "license_id": lic_id,
        "certificate": certificate_text,
        "payload": payload,
        "public_key": spki_pub_b64
    }

@app.post("/api/v1/licenses/{license_id}/revoke")
def toggle_license_revoke(license_id: str, req: RevokeRequest):
    with get_db() as conn:
        lic = conn.execute("SELECT * FROM licenses WHERE license_id = ?", (license_id,)).fetchone()
        if not lic:
            raise HTTPException(status_code=404, detail="License not found")

        new_status = 1 if req.action == "revoke" else 0
        conn.execute("""
            UPDATE licenses
            SET is_revoked = ?, revocation_reason = ?
            WHERE license_id = ?
        """, (new_status, req.reason if new_status == 1 else None, license_id))
        conn.commit()

    broadcast_sync({
        "type": "LICENSE_STATUS_CHANGED",
        "data": {
            "license_id": license_id,
            "is_revoked": bool(new_status),
            "reason": req.reason if new_status == 1 else None
        }
    })

    return {
        "status": "ok",
        "license_id": license_id,
        "is_revoked": bool(new_status),
        "reason": req.reason if new_status == 1 else None
    }

# ==============================================================================
# 6. Modern High-Performance Responsive Web Dashboard (Dark Mode)
# ==============================================================================

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KKDES Central Software Command Center</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2'><path d='M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'/></svg>">
    <style>
        :root {
            --bg-body: #090d16;
            --bg-card: #0f172a;
            --bg-card-sub: #1e293b;
            --border: #1e293b;
            --border-highlight: #334155;
            --text-primary: #f8fafc;
            --text-muted: #94a3b8;
            --brand: #10b981;
            --brand-dark: #059669;
            --danger: #ef4444;
            --warning: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-body);
            color: var(--text-primary);
            padding: 24px;
            font-size: 14px;
            line-height: 1.5;
        }
        .container { max-width: 1280px; margin: 0 auto; }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            padding-bottom: 20px;
            margin-bottom: 24px;
            border-bottom: 1px solid var(--border);
        }
        .header-title { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 10px; color: #fff; }
        .header-desc { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: #064e3b;
            color: #34d399;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
        }
        .pill-ws {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: #1e293b;
            color: #94a3b8;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        .pill-ws.connected { background: #064e3b; color: #34d399; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 18px 20px;
        }
        .stat-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; }
        .stat-value { font-size: 28px; font-weight: 800; margin-top: 6px; color: #fff; }
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 22px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 12px;
        }
        .card-title { font-size: 16px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        th {
            background: #0b1120;
            color: var(--text-muted);
            text-transform: uppercase;
            font-size: 11px;
            font-weight: 600;
            padding: 12px 14px;
            border-bottom: 1px solid var(--border);
        }
        td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        .row-alert td { background: rgba(239, 68, 68, 0.06); }
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
        }
        .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--brand);
            color: #064e3b;
            font-weight: 700;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            font-size: 12px;
            transition: all 0.15s ease;
        }
        .btn:hover { background: #34d399; }
        .btn-primary { background: #10b981; color: #022c22; }
        .btn-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
        .btn-danger:hover { background: #ef4444; color: #fff; }
        .btn-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
        .btn-success:hover { background: #10b981; color: #022c22; }
        .btn-sm { padding: 4px 10px; font-size: 11px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .text-muted { color: var(--text-muted); }
        .text-success { color: #34d399; }
        .text-warning { color: #fbbf24; }
        .text-brand { color: #34d399; }
        .text-right { text-align: right; }
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 100;
            padding: 20px;
        }
        .modal {
            background: var(--bg-card);
            border: 1px solid var(--border-highlight);
            border-radius: 14px;
            max-width: 580px;
            width: 100%;
            padding: 24px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6);
        }
        .form-group { margin-bottom: 14px; }
        .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
        .form-input {
            width: 100%;
            padding: 10px 12px;
            background: #090d16;
            border: 1px solid var(--border-highlight);
            border-radius: 8px;
            color: #fff;
            font-size: 13px;
        }
        .form-input:focus { outline: none; border-color: var(--brand); }
        textarea.cert-box {
            width: 100%;
            height: 180px;
            background: #000;
            color: #34d399;
            font-family: monospace;
            font-size: 11px;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #1e293b;
            margin-top: 10px;
            resize: vertical;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div>
                <div class="header-title">
                    <span>📡 KKDES Central Software Command Center</span>
                    <span class="pill">● LIVE AUTHORITY</span>
                    <span id="wsIndicator" class="pill-ws">○ WS CONNECTING...</span>
                </div>
                <div class="header-desc">Master Licensing, Instant Kill-Switch & Telemetry Security Hub • Owner: <strong>Metto Alex</strong> (KKDES Software Solutions)</div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <button onclick="openModal()" class="btn btn-primary">➕ Generate New License</button>
                <button onclick="window.location.reload()" class="btn" style="background:#1e293b; color:#fff;">🔄 Refresh</button>
            </div>
        </div>

        <!-- Stat Counters -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Issued Licenses</div>
                <div class="stat-value" id="valTotalLic">__TOTAL_LICENSES__</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active Connected Nodes</div>
                <div class="stat-value text-brand" id="valTotalNodes">__TOTAL_NODES__</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Security Alerts Detected</div>
                <div class="stat-value" id="valTotalAlerts" style="color: __ALERT_COLOR__;">__TOTAL_ALERTS__</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Public Verification Key</div>
                <div class="mono text-xs text-muted" style="margin-top:10px; word-break:break-all;">__PUBKEY_PREVIEW__</div>
            </div>
        </div>

        <!-- Table 1: Security Telemetry Alerts -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">🚨 Security Telemetry & Unauthorized Alerts (__TOTAL_ALERTS__)</div>
            </div>
            <div style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Alert Event</th>
                            <th>Machine ID</th>
                            <th>Origin Host / IP</th>
                            <th>Violation Reason</th>
                            <th>Detected At</th>
                        </tr>
                    </thead>
                    <tbody>
                        __ALERT_ROWS__
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Table 2: Active Connected Nodes -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">💻 Active Deployed Nodes & Connect-Back Telemetry (__TOTAL_NODES__)</div>
            </div>
            <div style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>License ID</th>
                            <th>Client / Customer</th>
                            <th>Hardware ID</th>
                            <th>Host / IP</th>
                            <th>Application Suite</th>
                            <th>Last Heartbeat</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        __ACT_ROWS__
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Table 3: Licenses Directory -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">📜 Master Licenses Directory & Kill-Switch (__TOTAL_LICENSES__)</div>
                <button onclick="openModal()" class="btn btn-sm btn-primary">➕ Issue License</button>
            </div>
            <div style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>License ID</th>
                            <th>Customer & Email</th>
                            <th>Product / Tier</th>
                            <th>Node Quota</th>
                            <th>Status</th>
                            <th>Expires</th>
                            <th class="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        __LIC_ROWS__
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Modal: Generate License -->
    <div id="licenseModal" class="modal-overlay">
        <div class="modal">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="color:#fff; font-size:18px;">🔑 Generate Cryptographic License</h3>
                <button onclick="closeModal()" style="background:none; border:none; color:#94a3b8; font-size:18px; cursor:pointer;">&times;</button>
            </div>
            <form id="genForm" onsubmit="handleGenerate(event)">
                <div class="form-group">
                    <label class="form-label">Customer / Institution Name</label>
                    <input type="text" id="custName" required placeholder="e.g. RU Smart Campus" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label">Administrator Email</label>
                    <input type="email" id="custEmail" required placeholder="e.g. admin@campus.edu" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label">Software Product</label>
                    <input type="text" id="prodName" value="Enterprise Software Suite" class="form-input">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Installation Limit (Nodes)</label>
                        <input type="number" id="nodeLimit" value="5" min="1" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Validity (Days)</label>
                        <input type="number" id="validDays" value="365" min="1" class="form-input">
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                    <button type="button" onclick="closeModal()" class="btn" style="background:#1e293b; color:#fff;">Cancel</button>
                    <button type="submit" id="genBtn" class="btn btn-primary">Sign & Issue Certificate</button>
                </div>
            </form>

            <div id="certResult" style="display:none; margin-top:16px;">
                <label class="form-label text-success">Signed Certificate (.lic) Ready:</label>
                <textarea id="certText" class="cert-box" readonly></textarea>
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button onclick="downloadCert()" class="btn btn-primary btn-sm">💾 Download .lic File</button>
                    <button onclick="copyCert()" class="btn btn-sm" style="background:#1e293b; color:#fff;">📋 Copy Text</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Real-time WebSocket connection to /ws
        let socket;
        function connectWebSocket() {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${proto}//${window.location.host}/ws`;
            const indicator = document.getElementById('wsIndicator');

            try {
                socket = new WebSocket(wsUrl);

                socket.onopen = function() {
                    if (indicator) {
                        indicator.innerText = '● WS SYNCED';
                        indicator.className = 'pill-ws connected';
                    }
                    // Keep connection alive with periodic heartbeat
                    setInterval(() => {
                        if (socket && socket.readyState === WebSocket.OPEN) {
                            socket.send('ping');
                        }
                    }, 25000);
                };

                socket.onmessage = function(event) {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'INITIAL_SNAPSHOT' && msg.data) {
                            document.getElementById('valTotalLic').innerText = msg.data.total_licenses;
                            document.getElementById('valTotalNodes').innerText = msg.data.total_nodes;
                            document.getElementById('valTotalAlerts').innerText = msg.data.total_alerts;
                        } else if (['ACTIVATION_UPDATE', 'TELEMETRY_ALERT', 'LICENSE_GENERATED', 'LICENSE_STATUS_CHANGED'].includes(msg.type)) {
                            // Flash subtle indicator and reload view after brief delay
                            setTimeout(() => window.location.reload(), 1500);
                        }
                    } catch (e) {}
                };

                socket.onclose = function() {
                    if (indicator) {
                        indicator.innerText = '○ WS RECONNECTING';
                        indicator.className = 'pill-ws';
                    }
                    setTimeout(connectWebSocket, 4000);
                };

                socket.onerror = function() {
                    if (indicator) {
                        indicator.innerText = '○ WS RECONNECTING';
                        indicator.className = 'pill-ws';
                    }
                };
            } catch (err) {
                setTimeout(connectWebSocket, 5000);
            }
        }
        connectWebSocket();

        function openModal() {
            document.getElementById('licenseModal').style.display = 'flex';
            document.getElementById('certResult').style.display = 'none';
        }
        function closeModal() {
            document.getElementById('licenseModal').style.display = 'none';
        }
        async function handleGenerate(e) {
            e.preventDefault();
            const btn = document.getElementById('genBtn');
            btn.innerText = 'Signing...';
            btn.disabled = true;

            const payload = {
                customer: document.getElementById('custName').value,
                email: document.getElementById('custEmail').value,
                product: document.getElementById('prodName').value,
                installation_limit: parseInt(document.getElementById('nodeLimit').value),
                expires_in_days: parseInt(document.getElementById('validDays').value)
            };

            try {
                const res = await fetch('/api/v1/licenses/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    document.getElementById('certText').value = data.certificate;
                    document.getElementById('certResult').style.display = 'block';
                    btn.innerText = 'Generated!';
                } else {
                    alert('Error generating license: ' + (data.detail || 'Server error'));
                    btn.innerText = 'Sign & Issue Certificate';
                    btn.disabled = false;
                }
            } catch (err) {
                alert('Connection error: ' + err.message);
                btn.innerText = 'Sign & Issue Certificate';
                btn.disabled = false;
            }
        }

        function copyCert() {
            const t = document.getElementById('certText');
            t.select();
            navigator.clipboard.writeText(t.value);
            alert('Certificate copied to clipboard!');
        }

        function downloadCert() {
            const text = document.getElementById('certText').value;
            const blob = new Blob([text], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'license.lic';
            a.click();
        }

        async function toggleRevoke(licId, action) {
            const promptMsg = action === 'revoke' 
                ? 'Enter reason for invoking Kill-Switch on ' + licId + ':' 
                : 'Confirm reinstating license ' + licId + '?';
            const reason = prompt(promptMsg, action === 'revoke' ? 'Violation of licensing terms' : 'Reinstated by authority');
            if (reason === null) return;

            try {
                const res = await fetch('/api/v1/licenses/' + licId + '/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: action, reason: reason })
                });
                if (res.ok) {
                    window.location.reload();
                } else {
                    const d = await res.json();
                    alert('Error: ' + (d.detail || 'Could not update status'));
                }
            } catch (e) {
                alert('Connection error: ' + e.message);
            }
        }
    </script>
</body>
</html>"""

@app.get("/", response_class=HTMLResponse)
def admin_dashboard():
    with get_db() as conn:
        licenses = conn.execute("SELECT * FROM licenses ORDER BY created_at DESC").fetchall()
        activations = conn.execute("SELECT * FROM activations ORDER BY last_heartbeat DESC").fetchall()
        alerts = conn.execute("SELECT * FROM telemetry_alerts ORDER BY created_at DESC LIMIT 50").fetchall()

    total_licenses = len(licenses)
    total_nodes = len([a for a in activations if a["status"] == "ACTIVE"])
    total_alerts = len(alerts)

    # License table rows
    lic_rows = ""
    for l in licenses:
        used = len([a for a in activations if a["license_id"] == l["license_id"] and a["status"] == "ACTIVE"])
        limit = l["installation_limit"]
        is_revoked = bool(l["is_revoked"])
        status_badge = '<span class="badge badge-danger">REVOKED</span>' if is_revoked else '<span class="badge badge-success">ACTIVE</span>'
        kill_action = f"""<button onclick="toggleRevoke('{l['license_id']}', '{'reinstate' if is_revoked else 'revoke'}')" class="btn {'btn-success' if is_revoked else 'btn-danger'} btn-sm">{'Reinstate' if is_revoked else 'Kill-Switch'}</button>"""

        lic_rows += f"""<tr>
            <td class="mono font-bold text-white">{l['license_id']}</td>
            <td><strong>{l['customer']}</strong><br><small class="text-muted">{l['email'] or 'N/A'}</small></td>
            <td>{l['product']}<br><small class="text-muted">{l['type']}</small></td>
            <td><span class="mono font-bold { 'text-warning' if used >= limit else 'text-success' }">{used}</span> / {limit}</td>
            <td>{status_badge}</td>
            <td class="mono text-muted text-xs">{str(l['expires_at'])[:10]}</td>
            <td class="text-right">{kill_action}</td>
        </tr>"""

    # Active nodes rows
    act_rows = ""
    for a in activations:
        act_rows += f"""<tr>
            <td class="mono font-bold text-brand">{a['license_id']}</td>
            <td><strong>{a['customer'] or a['client_name'] or 'Node'}</strong></td>
            <td class="mono text-xs text-muted" title="{a['machine_id']}">{a['machine_id'][:16]}...</td>
            <td>{a['hostname'] or 'N/A'}<br><small class="mono text-muted">{a['ip_address']}</small></td>
            <td class="text-xs">{a['app_name'] or 'Suite'}<br><small class="text-muted">{a['app_version'] or ''}</small></td>
            <td class="mono text-xs text-muted">{str(a['last_heartbeat'])[:19]}</td>
            <td><span class="badge badge-success">● {a['status']}</span></td>
        </tr>"""

    # Security alert rows
    alert_rows = ""
    for alt in alerts:
        alert_rows += f"""<tr class="row-alert">
            <td><span class="badge badge-danger">⚠️ {alt['alert_type']}</span></td>
            <td class="mono text-xs">{alt['machine_id'][:16] if alt['machine_id'] else 'N/A'}</td>
            <td>{alt['hostname'] or 'N/A'}<br><small class="mono text-muted">{alt['ip_address']}</small></td>
            <td class="text-sm font-medium">{alt['reason'] or 'Security Violation'}</td>
            <td class="mono text-xs text-muted">{str(alt['created_at'])[:19]}</td>
        </tr>"""

    html = HTML_TEMPLATE.replace("__TOTAL_LICENSES__", str(total_licenses))
    html = html.replace("__TOTAL_NODES__", str(total_nodes))
    html = html.replace("__TOTAL_ALERTS__", str(total_alerts))
    html = html.replace("__ALERT_COLOR__", "#ef4444" if total_alerts > 0 else "#94a3b8")
    html = html.replace("__PUBKEY_PREVIEW__", f"{spki_pub_b64[:30]}...")
    html = html.replace("__LIC_ROWS__", lic_rows or '<tr><td colspan="7" class="text-muted text-center" style="padding:24px;">No licenses issued yet. Click "Generate New License" to create one.</td></tr>')
    html = html.replace("__ACT_ROWS__", act_rows or '<tr><td colspan="7" class="text-muted text-center" style="padding:24px;">No active client installations registered yet. When a client activates a license, it will appear here instantly.</td></tr>')
    html = html.replace("__ALERT_ROWS__", alert_rows or '<tr><td colspan="5" class="text-muted text-center" style="padding:24px;">No security alerts recorded. All connected instances are running within authorized limits.</td></tr>')

    return HTMLResponse(content=html)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
