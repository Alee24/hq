# Central Software Command Center

> Production-grade Infrastructure and Application Lifecycle Management Platform for enterprise ICT operations across multi-server VPS clusters.

---

## 1. System Overview

The **Central Software Command Center** allows system administrators to centrally monitor, manage, deploy, restart, license, and maintain multiple websites, web applications, and services hosted across multiple bare-metal and VPS servers.

### Core Capabilities
- **Cluster & Server Telemetry**: Real-time CPU, RAM, Disk, IO, Network bandwidth, Load average, process trees, and open ports.
- **Continuous Monitoring**: Automatic synthetic HTTP probes, DNS resolution timings, TLS handshake latencies, SSL certificate validity, and uptime SLA calculation.
- **13-Step Automated Deployment Pipeline**: Zero-downtime container swaps, Git branch fetching, automated test running, pre-deployment snapshot backups, graceful reloads, and health probe confirmation.
- **Emergency Rollback Engine**: One-click instant recovery with commit diff inspection, version restoration, and audit safeguards.
- **Cryptographic License Authority**: Asymmetric **Ed25519** digital signing, online hardware-fingerprint quota validation (`/api/licenses/validate`), online activations (`/api/licenses/activate`), and downloadable offline digitally signed license files (`license.key`).
- **Safe Command Safeguards**: Dangerous operations (reboots, server restarts, rollbacks) are strictly protected with typed keyword confirmation modals (e.g. typing `"RESTART"`).
- **Immutable Audit Logging**: Non-repudiable audit logs recording user, IP, action, entity, details, and result.
- **Infrastructure Topology**: Interactive dynamic network map mapping Public Ingress &rarr; WAF &rarr; VPS Hosts &rarr; Microservices.

---

## 2. Technology Architecture

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Vite (WCAG 2.1 AA contrast compliant, 8pt spatial grid, Light/Dark theme).
- **Backend**: Python 3.12/3.14, FastAPI, Async SQLAlchemy, Pydantic v2, WebSockets, Cryptography (Ed25519), APScheduler.
- **Database**: PostgreSQL (Production) / SQLite Async (Dual-engine support).
- **Cache & Broker**: Redis 7.
- **Agent**: Lightweight standalone Python agent with HMAC authentication and whitelisted execution.
- **Orchestration**: Docker Compose with Nginx reverse proxy.

---

## 3. Production VPS Deployment Command

To deploy the entire platform onto any Ubuntu/Debian VPS with Docker installed, execute this copy-paste ready command sequence:

```bash
git clone <repository-url> command-center && \
cd command-center && \
cp .env.example .env && \
sed -i "s/command-center-super-secure-production-secret-key-389104810283/$(openssl rand -hex 32)/g" .env && \
docker compose build --no-cache && \
docker compose up -d && \
docker image prune -f
```

### Health Verification Command
```bash
curl -f http://localhost/api/health && \
docker compose ps
```

### Rollback Command (If required)
```bash
docker compose down && \
git checkout HEAD~1 && \
docker compose up -d
```

---

## 4. Default Demonstration Accounts

| Role | Username | Default Password | Privileges |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `Password123!` | Root platform control, user RBAC, system settings |
| **Infrastructure Admin** | `infra_admin` | `Password123!` | Host server controls, reboot, systemctl services |
| **Deployment Admin** | `deploy_admin` | `Password123!` | 13-step release pipeline, Git branch sync, rollbacks |
| **Application Admin** | `app_admin` | `Password123!` | Application restarts, maintenance windows |
| **License Admin** | `license_admin` | `Password123!` | Generate Ed25519 licenses, quota tracking, revoke |
| **Auditor / Viewer** | `viewer` | `Password123!` | Read-only inspection of dashboards, telemetry, logs |

---

## 5. Standalone Monitoring Agent Installation

On any remote VPS that you wish to monitor via the Central Command Center:

```bash
# 1. Download agent script
curl -o /usr/local/bin/command_center_agent.py http://<COMMAND_CENTER_IP>/agent/command_center_agent.py
chmod +x /usr/local/bin/command_center_agent.py

# 2. Run test telemetry probe
python3 /usr/local/bin/command_center_agent.py --server http://<COMMAND_CENTER_IP> --server-id VPS-01 --once

# 3. Create systemd daemon
cat <<EOF | sudo tee /etc/systemd/system/command-center-agent.service
[Unit]
Description=Central Software Command Center Remote Monitoring Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /usr/local/bin/command_center_agent.py --server http://<COMMAND_CENTER_IP> --server-id VPS-01 --interval 60
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload && sudo systemctl enable --now command-center-agent
```

---

## 6. Cryptographic License Verification Workflow

### Online Validation API (invoked by client applications)
```bash
curl -X POST http://<COMMAND_CENTER_IP>/api/licenses/validate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "LIC-2026-000380",
    "product_name": "Smart Campus Enterprise Suite",
    "product_version": "v2.4.1",
    "installation_fingerprint": "node-hw-sha256-8a9b20491029410f8a91",
    "hostname": "vps01.infra.enterprise.net"
  }'
```

### Online Activation API (invoked during installation)
```bash
curl -X POST http://<COMMAND_CENTER_IP>/api/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "LIC-2026-000380",
    "product_name": "Smart Campus Enterprise Suite",
    "product_version": "v2.4.1",
    "installation_fingerprint": "node-hw-sha256-4299b9104fae89104921",
    "hostname": "vps02.infra.enterprise.net",
    "ip_address": "109.199.111.52"
  }'
```

### Offline License Key Format (`.key`)
Digitally signed `.key` files contain the canonical base64 payload and Ed25519 digital signature block verifiable locally via the command center's public verification key.

---

## 7. Interactive API Documentation
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI Specification: `http://localhost:8000/openapi.json`
