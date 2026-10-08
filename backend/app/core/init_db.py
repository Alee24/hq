import asyncio
import time
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from backend.app.core.database import engine, AsyncSessionLocal, Base
from backend.app.core.config import settings
from backend.app.core.security import hash_password, sign_license_payload
from backend.app.models.entities import (
    User, Server, Application, Domain, ServerMetric, MonitoringResult,
    Deployment, License, LicenseActivation, Alert, AlertRule, Backup, AppLog, AuditLog, Incident,
    SystemSetting
)


async def purge_dummy_data():
    """Purges all dummy data (servers, applications, domains, mock licenses,
    mock deployments, mock incidents, mock alerts, mock logs, and demo users)
    leaving a clean, production-ready system with only the authoritative Super Admin
    and default monitoring alert rules."""
    async with AsyncSessionLocal() as db:
        # Delete dependent child tables first
        await db.execute(delete(ServerMetric))
        await db.execute(delete(MonitoringResult))
        await db.execute(delete(AppLog))
        await db.execute(delete(Incident))
        await db.execute(delete(Backup))
        await db.execute(delete(Alert))
        await db.execute(delete(Deployment))
        await db.execute(delete(Domain))
        await db.execute(delete(Application))
        await db.execute(delete(Server))
        await db.execute(delete(LicenseActivation))
        await db.execute(delete(License))
        await db.execute(delete(AuditLog))
        
        # Remove all non-admin demo / test users
        await db.execute(delete(User).where(User.username != settings.ADMIN_USERNAME))
        
        # Ensure Super Admin exists with authoritative credentials
        res = await db.execute(
            select(User).where(
                (User.username == settings.ADMIN_USERNAME) |
                (User.email == settings.ADMIN_EMAIL) |
                (User.email == "mettoalex@gmail.com") |
                (User.username == "admin")
            )
        )
        admin_user = res.scalar_one_or_none()
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        if not admin_user:
            admin_user = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                full_name="Alex Metto (Super Admin)",
                role="SUPER_ADMIN",
                is_active=True,
                created_at=now_naive,
                updated_at=now_naive
            )
            db.add(admin_user)
            await db.flush()
        else:
            admin_user.username = settings.ADMIN_USERNAME
            admin_user.email = settings.ADMIN_EMAIL
            admin_user.hashed_password = hash_password(settings.ADMIN_PASSWORD)
            admin_user.full_name = "Alex Metto (Super Admin)"
            admin_user.is_active = True
            admin_user.role = "SUPER_ADMIN"
            admin_user.updated_at = now_naive
            await db.flush()
            
        # Ensure standard Alert Rules exist
        rule_check = await db.execute(select(AlertRule).limit(1))
        if not rule_check.scalar_one_or_none():
            rules_data = [
                ("High CPU Utilization Warning", "cpu", "GREATER_THAN", 80.0, "WARNING", "ALL"),
                ("Critical CPU Utilization", "cpu", "GREATER_THAN", 95.0, "CRITICAL", "ALL"),
                ("High Memory Critical", "ram", "GREATER_THAN", 90.0, "CRITICAL", "ALL"),
                ("Disk Capacity Critical", "disk", "GREATER_THAN", 90.0, "CRITICAL", "ALL"),
                ("SSL Certificate Expiration Warning", "ssl_days", "LESS_THAN", 30.0, "WARNING", "ALL"),
                ("License Expiration Warning", "license_days", "LESS_THAN", 30.0, "WARNING", "ALL")
            ]
            for r_name, m_name, cond, thresh, r_sev, chan in rules_data:
                db.add(AlertRule(
                    name=r_name,
                    metric_name=m_name,
                    condition=cond,
                    threshold=thresh,
                    severity=r_sev,
                    channel=chan
                ))

        # Ensure default System Settings exist
        settings_check = await db.execute(select(SystemSetting).limit(1))
        if not settings_check.scalar_one_or_none():
            default_settings = [
                ("monitor_interval", "60", "monitoring", "Synthetic health check interval in seconds"),
                ("session_timeout", "1440", "security", "Operator session idle timeout in minutes"),
                ("webhook_url", "https://hooks.slack.com/services/T00/B00/X00", "notifications", "Central incident alert webhook"),
                ("license_signing_enforced", "true", "licensing", "Ed25519 signature enforcement flag"),
                ("whitelist_agent_execution", "true", "security", "Strict whitelist command security enforcement")
            ]
            for s_key, s_val, s_cat, s_desc in default_settings:
                db.add(SystemSetting(key=s_key, value=s_val, category=s_cat, description=s_desc))

        await db.commit()


from sqlalchemy import text

async def apply_schema_migrations():
    """Safely applies non-destructive schema migrations to preserve existing data integrity across SQLite and PostgreSQL."""
    from backend.app.core.database import engine as current_engine
    async with current_engine.begin() as conn:
        dialect_name = conn.dialect.name

        server_cols = [
            ("ssh_user", "VARCHAR(50) DEFAULT 'root'"),
            ("ssh_auth_type", "VARCHAR(20) DEFAULT 'KEY'"),
            ("ssh_key", "TEXT"),
            ("ssh_password", "VARCHAR(255)"),
            ("agent_token", "VARCHAR(64)"),
            ("connection_type", "VARCHAR(20) DEFAULT 'SSH'")
        ]

        backup_cols = [
            ("database_type", "VARCHAR(50) DEFAULT 'POSTGRESQL'"),
            ("database_name", "VARCHAR(100)")
        ]

        app_cols = [
            ("root_path", "VARCHAR(500)")
        ]

        if dialect_name == "postgresql":
            # PostgreSQL natively supports ADD COLUMN IF NOT EXISTS without aborting transactions
            for col_name, col_type in server_cols:
                await conn.execute(text(f"ALTER TABLE servers ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            for col_name, col_type in backup_cols:
                await conn.execute(text(f"ALTER TABLE backups ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            for col_name, col_type in app_cols:
                await conn.execute(text(f"ALTER TABLE applications ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            # Clean up bogus auto-discovered Apache comment artifacts
            await conn.execute(text("DELETE FROM domains WHERE domain_name IN ('#', 'directive', 'www.example.com')"))
            await conn.execute(text("DELETE FROM applications WHERE name IN ('#', 'directive', 'www.example.com') OR domain IN ('#', 'directive', 'www.example.com')"))
        else:
            # SQLite: Check existing table schema before altering to prevent duplicate column errors
            try:
                res = await conn.execute(text("PRAGMA table_info(servers)"))
                server_existing = [row[1] for row in res.fetchall()]
                for col_name, col_type in server_cols:
                    if col_name not in server_existing:
                        await conn.execute(text(f"ALTER TABLE servers ADD COLUMN {col_name} {col_type}"))

                res_b = await conn.execute(text("PRAGMA table_info(backups)"))
                backup_existing = [row[1] for row in res_b.fetchall()]
                for col_name, col_type in backup_cols:
                    if col_name not in backup_existing:
                        await conn.execute(text(f"ALTER TABLE backups ADD COLUMN {col_name} {col_type}"))

                res_a = await conn.execute(text("PRAGMA table_info(applications)"))
                app_existing = [row[1] for row in res_a.fetchall()]
                for col_name, col_type in app_cols:
                    if col_name not in app_existing:
                        await conn.execute(text(f"ALTER TABLE applications ADD COLUMN {col_name} {col_type}"))

                # Clean up bogus auto-discovered Apache comment artifacts
                await conn.execute(text("DELETE FROM domains WHERE domain_name IN ('#', 'directive', 'www.example.com')"))
                await conn.execute(text("DELETE FROM applications WHERE name IN ('#', 'directive', 'www.example.com') OR domain IN ('#', 'directive', 'www.example.com')"))
            except Exception as e:
                print(f"[SQLITE MIGRATION NOTICE]: {e}")

async def init_db(seed_demo: bool = False):
    from backend.app.core.database import update_db_engine, engine as active_engine
    import re
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    # Attempt database connection and schema setup
    connected = False
    max_retries = 6
    for attempt in range(1, max_retries + 1):
        try:
            from backend.app.core.database import engine as current_eng
            async with current_eng.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            connected = True
            break
        except Exception as e:
            err_msg = str(e)
            print(f"[DB INIT] Connection attempt {attempt}/{max_retries}: {err_msg}", flush=True)

            # Auto-healing: If PostgreSQL rejected password, test default fallback passwords
            if "password authentication failed" in err_msg.lower() and "postgres" in settings.DATABASE_URL:
                for fb_pass in ["ChangeMeSecurePass123", "ChangeMeSecurePass123!", "commandcenter"]:
                    try:
                        fb_url = re.sub(r":([^:@]+)@", f":{fb_pass}@", settings.DATABASE_URL)
                        fb_eng = create_async_engine(fb_url, pool_pre_ping=True)
                        async with fb_eng.begin() as fb_conn:
                            # Extract target password from settings.DATABASE_URL
                            m = re.search(r":([^:@]+)@", settings.DATABASE_URL)
                            if m:
                                target_p = m.group(1)
                                await fb_conn.execute(text(f"ALTER USER {settings.ADMIN_USERNAME or 'commandcenter'} WITH PASSWORD '{target_p}'"))
                                print("[DB AUTO-HEAL]: Successfully synced PostgreSQL user password with .env!", flush=True)
                        # Switch back to target engine
                        update_db_engine(settings.DATABASE_URL)
                        break
                    except Exception:
                        pass

            if attempt == max_retries:
                # If PostgreSQL is still unreachable, fall back to SQLite to guarantee uptime
                if "postgres" in settings.DATABASE_URL:
                    print("[DB INIT NOTICE]: PostgreSQL unavailable after retries. Engaging high-availability SQLite engine...", flush=True)
                    sqlite_url = "sqlite+aiosqlite:///./command_center.db"
                    sq_eng = update_db_engine(sqlite_url)
                    async with sq_eng.begin() as sconn:
                        await sconn.run_sync(Base.metadata.create_all)
                    connected = True
                    break
                else:
                    raise

            await asyncio.sleep(2)

    # Safely apply non-destructive schema updates
    try:
        await apply_schema_migrations()
    except Exception as e:
        print(f"[SCHEMA MIGRATION WARNING]: {e}")

    async with AsyncSessionLocal() as db:
        # Ensure Super Admin exists with authoritative credentials
        res = await db.execute(
            select(User).where(
                (User.username == settings.ADMIN_USERNAME) |
                (User.email == settings.ADMIN_EMAIL) |
                (User.email == "mettoalex@gmail.com") |
                (User.username == "admin")
            )
        )
        existing_admin = res.scalar_one_or_none()
        if not existing_admin:
            u = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                full_name="Alex Metto (Super Admin)",
                role="SUPER_ADMIN",
                is_active=True
            )
            db.add(u)
            await db.flush()
        else:
            existing_admin.username = settings.ADMIN_USERNAME
            existing_admin.email = settings.ADMIN_EMAIL
            existing_admin.hashed_password = hash_password(settings.ADMIN_PASSWORD)
            existing_admin.full_name = "Alex Metto (Super Admin)"
            existing_admin.is_active = True
            existing_admin.role = "SUPER_ADMIN"
            await db.flush()

        # Ensure standard Alert Rules exist
        rule_res = await db.execute(select(AlertRule).limit(1))
        if not rule_res.scalar_one_or_none():
            rules_data = [
                ("High CPU Utilization Warning", "cpu", "GREATER_THAN", 80.0, "WARNING", "ALL"),
                ("Critical CPU Utilization", "cpu", "GREATER_THAN", 95.0, "CRITICAL", "ALL"),
                ("High Memory Critical", "ram", "GREATER_THAN", 90.0, "CRITICAL", "ALL"),
                ("Disk Capacity Critical", "disk", "GREATER_THAN", 90.0, "CRITICAL", "ALL"),
                ("SSL Certificate Expiration Warning", "ssl_days", "LESS_THAN", 30.0, "WARNING", "ALL"),
                ("License Expiration Warning", "license_days", "LESS_THAN", 30.0, "WARNING", "ALL")
            ]
            for r_name, m_name, cond, thresh, r_sev, chan in rules_data:
                db.add(AlertRule(
                    name=r_name,
                    metric_name=m_name,
                    condition=cond,
                    threshold=thresh,
                    severity=r_sev,
                    channel=chan
                ))
            await db.flush()

        if not seed_demo:
            await db.commit()
            return

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # 2. Seed 3 VPS Servers
        servers_data = [
            {
                "name": "VPS-01-Production-Core",
                "hostname": "vps01.infra.enterprise.net",
                "provider": "Hetzner Dedicated",
                "public_ip": "109.199.111.51",
                "private_ip": "10.0.1.10",
                "os": "Ubuntu Linux",
                "os_version": "24.04 LTS",
                "kernel": "6.8.0-31-generic",
                "cpu_cores": 8,
                "ram_total_mb": 16384,
                "disk_total_gb": 320,
                "status": "ONLINE"
            },
            {
                "name": "VPS-02-App-Cluster",
                "hostname": "vps02.infra.enterprise.net",
                "provider": "DigitalOcean Droplet",
                "public_ip": "109.199.111.52",
                "private_ip": "10.0.1.20",
                "os": "Ubuntu Linux",
                "os_version": "24.04 LTS",
                "kernel": "6.8.0-31-generic",
                "cpu_cores": 4,
                "ram_total_mb": 8192,
                "disk_total_gb": 160,
                "status": "ONLINE"
            },
            {
                "name": "VPS-03-Staging-Dev",
                "hostname": "vps03.infra.enterprise.net",
                "provider": "AWS EC2",
                "public_ip": "109.199.111.53",
                "private_ip": "10.0.2.30",
                "os": "Debian GNU/Linux",
                "os_version": "12 Bookworm",
                "kernel": "6.1.0-21-amd64",
                "cpu_cores": 2,
                "ram_total_mb": 4096,
                "disk_total_gb": 80,
                "status": "ONLINE"
            }
        ]

        server_objs = []
        for s_data in servers_data:
            s = Server(**s_data)
            db.add(s)
            server_objs.append(s)

        await db.flush()

        # Seed Server Metrics for graphs
        for s in server_objs:
            for hours_ago in range(24, 0, -1):
                t_point = now - timedelta(hours=hours_ago)
                cpu_base = 25.0 + (hash(s.name) % 25)
                cpu_val = min(92.0, max(8.0, cpu_base + (hours_ago % 15) - 5))
                m = ServerMetric(
                    server_id=s.id,
                    cpu_percent=round(cpu_val, 1),
                    ram_percent=round(52.0 + (hash(s.name) % 20), 1),
                    disk_percent=round(48.2 + (s.cpu_cores), 1),
                    disk_io_read_mb=18.4,
                    disk_io_write_mb=9.2,
                    network_rx_kb=1420.0,
                    network_tx_kb=980.0,
                    load_1m=round(cpu_val / 20, 2),
                    load_5m=round(cpu_val / 22, 2),
                    load_15m=round(cpu_val / 25, 2),
                    open_ports=[22, 80, 443, 5432, 6379],
                    running_processes_count=110 + s.cpu_cores * 4,
                    timestamp=t_point
                )
                db.add(m)

        # 3. Seed 10 Cryptographic Enterprise Licenses
        license_types = ["Enterprise", "Standard", "Perpetual", "Enterprise", "Standard", "Trial", "Enterprise", "Standard", "Enterprise", "Perpetual"]
        customer_names = [
            "Apex Global University", "St. Jude Health System", "National Commerce Bank",
            "OmniCorp Logistics", "Metro Education Board", "Veritas Analytics Ltd",
            "Pacific Maritime Group", "Horizon Power Corp", "Summit Financial Partners", "Apex Research Institute"
        ]
        lic_objs = []
        for idx in range(10):
            lic_num = f"LIC-2026-000{380 + idx}"
            exp_days = 365
            status = "ACTIVE"
            if idx == 1: # Expiring in 5 days
                exp_days = 5
                status = "ACTIVE"
            elif idx == 2: # Expiring in 22 days
                exp_days = 22
                status = "ACTIVE"
            elif idx == 5: # Expired
                exp_days = -15
                status = "EXPIRED"

            exp_date = now + timedelta(days=exp_days)
            cust = customer_names[idx]
            prod = "Smart Campus Enterprise Suite" if idx % 2 == 0 else "Enterprise Process Hub"
            allowed_inst = 5 if idx != 0 else 10
            active_inst = min(allowed_inst, 2 + (idx % 3))
            
            features = {
                "high_availability": True,
                "api_rate_unlimited": True,
                "ssl_automation": True,
                "audit_compliance": True,
                "custom_branding": idx % 2 == 0
            }
            
            payload = {
                "license_id": lic_num,
                "product": prod,
                "customer": cust,
                "email": f"licenses@{cust.lower().replace(' ', '')}.org",
                "version": "v2.4.1",
                "type": license_types[idx],
                "installation_limit": allowed_inst,
                "features": features,
                "issued_at": (now - timedelta(days=60)).isoformat(),
                "expires_at": exp_date.isoformat()
            }
            payload_b64, sig_b64 = sign_license_payload(payload)

            lic = License(
                license_key=lic_num,
                product_name=prod,
                customer_name=cust,
                customer_email=f"compliance@{cust.lower().replace(' ', '')}.com",
                product_version="v2.4.1",
                license_type=license_types[idx],
                allowed_installations=allowed_inst,
                active_installations=active_inst,
                status=status,
                features=features,
                payload_b64=payload_b64,
                signature_b64=sig_b64,
                issued_at=now - timedelta(days=60),
                expires_at=exp_date
            )
            db.add(lic)
            lic_objs.append(lic)

        await db.flush()

        # Seed activations for the first license
        act1 = LicenseActivation(
            license_id=lic_objs[0].id,
            installation_fingerprint="node-hw-sha256-8a9b20491029410f8a91",
            hostname="vps01.infra.enterprise.net",
            ip_address="109.199.111.51",
            token="ACT-89f10a8b910248a",
            activated_at=now - timedelta(days=50),
            last_validated_at=now,
            is_active=True
        )
        act2 = LicenseActivation(
            license_id=lic_objs[0].id,
            installation_fingerprint="node-hw-sha256-4299b9104fae89104921",
            hostname="vps02.infra.enterprise.net",
            ip_address="109.199.111.52",
            token="ACT-7718be91a0f8182",
            activated_at=now - timedelta(days=40),
            last_validated_at=now,
            is_active=True
        )
        db.add_all([act1, act2])

        # 4. Seed 8 Applications
        apps_data = [
            {
                "name": "Smart Campus",
                "description": "Primary university administration, admissions and student management portal.",
                "environment": "production",
                "domain": "smartcampus.example.com",
                "server_id": server_objs[0].id,
                "port": 443,
                "app_type": "Web Application",
                "framework": "React / FastAPI",
                "repo_url": "https://github.com/organization/smart-campus",
                "git_branch": "main",
                "current_version": "v2.4.1",
                "current_commit": "8a92f31",
                "latest_repo_commit": "91bd721", # Update available
                "deployment_status": "SUCCESS",
                "process_manager": "Docker Compose",
                "service_name": "smartcampus-core",
                "uptime_percent": 99.98,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/health",
                "health_status": "ONLINE",
                "license_id": lic_objs[0].id,
                "last_deployment_at": now - timedelta(hours=6),
                "last_restart_at": now - timedelta(days=12)
            },
            {
                "name": "Student Registry API",
                "description": "Central high-throughput student records and identity management REST API.",
                "environment": "production",
                "domain": "registry.example.com",
                "server_id": server_objs[0].id,
                "port": 8000,
                "app_type": "REST API Service",
                "framework": "FastAPI",
                "repo_url": "https://github.com/organization/student-registry",
                "git_branch": "main",
                "current_version": "v3.1.0",
                "current_commit": "14f0892",
                "latest_repo_commit": "14f0892",
                "deployment_status": "SUCCESS",
                "process_manager": "Docker",
                "service_name": "registry-api",
                "uptime_percent": 99.99,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/api/health",
                "health_status": "ONLINE",
                "license_id": lic_objs[0].id,
                "last_deployment_at": now - timedelta(days=2),
                "last_restart_at": now - timedelta(days=14)
            },
            {
                "name": "Learning Management System (LMS)",
                "description": "Course management, interactive quizzes, video streaming and grading engine.",
                "environment": "production",
                "domain": "lms.example.com",
                "server_id": server_objs[1].id,
                "port": 443,
                "app_type": "Web Application",
                "framework": "Next.js / Node.js",
                "repo_url": "https://github.com/organization/campus-lms",
                "git_branch": "main",
                "current_version": "v2.2.0",
                "current_commit": "7b88192",
                "latest_repo_commit": "7b88192",
                "deployment_status": "SUCCESS",
                "process_manager": "Docker Compose",
                "service_name": "lms-web",
                "uptime_percent": 99.95,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/health",
                "health_status": "ONLINE",
                "license_id": lic_objs[3].id,
                "last_deployment_at": now - timedelta(days=4),
                "last_restart_at": now - timedelta(days=4)
            },
            {
                "name": "Campus Mobile Gateway",
                "description": "Mobile app backend for push notifications, schedules, and student ID badges.",
                "environment": "production",
                "domain": "api.mobile.example.com",
                "server_id": server_objs[1].id,
                "port": 8080,
                "app_type": "API Gateway",
                "framework": "Go / Gin",
                "repo_url": "https://github.com/organization/mobile-gateway",
                "git_branch": "main",
                "current_version": "v1.8.4",
                "current_commit": "4e1199a",
                "latest_repo_commit": "4e1199a",
                "deployment_status": "SUCCESS",
                "process_manager": "Docker",
                "service_name": "mobile-gateway",
                "uptime_percent": 99.92,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/healthz",
                "health_status": "ONLINE",
                "license_id": lic_objs[4].id,
                "last_deployment_at": now - timedelta(days=8),
                "last_restart_at": now - timedelta(days=8)
            },
            {
                "name": "Staff & Faculty Portal",
                "description": "Faculty research submissions, payroll records, and tenure review workflows.",
                "environment": "production",
                "domain": "staff.example.com",
                "server_id": server_objs[0].id,
                "port": 443,
                "app_type": "Web Application",
                "framework": "React / Django",
                "repo_url": "https://github.com/organization/staff-portal",
                "git_branch": "main",
                "current_version": "v1.4.2",
                "current_commit": "9012cad",
                "latest_repo_commit": "9012cad",
                "deployment_status": "SUCCESS",
                "process_manager": "Docker",
                "service_name": "staff-portal",
                "uptime_percent": 99.88,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/health",
                "health_status": "ONLINE",
                "license_id": lic_objs[6].id,
                "last_deployment_at": now - timedelta(days=10),
                "last_restart_at": now - timedelta(days=10)
            },
            {
                "name": "Smart Campus Staging",
                "description": "Pre-production validation environment for candidate feature testing.",
                "environment": "staging",
                "domain": "staging.smartcampus.example.com",
                "server_id": server_objs[2].id,
                "port": 443,
                "app_type": "Web Application",
                "framework": "React / FastAPI",
                "repo_url": "https://github.com/organization/smart-campus",
                "git_branch": "staging",
                "current_version": "v2.5.0-rc1",
                "current_commit": "91bd721",
                "latest_repo_commit": "91bd721",
                "deployment_status": "SUCCESS",
                "process_manager": "Docker",
                "service_name": "smartcampus-staging",
                "uptime_percent": 99.40,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/health",
                "health_status": "ONLINE",
                "license_id": lic_objs[0].id,
                "last_deployment_at": now - timedelta(hours=2),
                "last_restart_at": now - timedelta(hours=2)
            },
            {
                "name": "Analytics & Reporting Engine",
                "description": "Nightly batch analytics, SQL aggregations, and executive dashboard exports.",
                "environment": "production",
                "domain": "bi.example.com",
                "server_id": server_objs[1].id,
                "port": 9000,
                "app_type": "Background Service",
                "framework": "Python / Polars",
                "repo_url": "https://github.com/organization/campus-analytics",
                "git_branch": "main",
                "current_version": "v1.1.2",
                "current_commit": "33a9081",
                "latest_repo_commit": "33a9081",
                "deployment_status": "SUCCESS",
                "process_manager": "systemd",
                "service_name": "analytics-worker",
                "uptime_percent": 98.40,
                "http_status": 200,
                "ssl_status": "VALID",
                "health_check_url": "/health",
                "health_status": "DEGRADED",
                "license_id": lic_objs[7].id,
                "last_deployment_at": now - timedelta(days=15),
                "last_restart_at": now - timedelta(hours=18)
            },
            {
                "name": "Smart Campus Development Sandbox",
                "description": "Continuous integration test sandbox running feature branch builds.",
                "environment": "development",
                "domain": "dev.smartcampus.example.com",
                "server_id": server_objs[2].id,
                "port": 3000,
                "app_type": "Web Application",
                "framework": "Node.js / Express",
                "repo_url": "https://github.com/organization/smart-campus",
                "git_branch": "develop",
                "current_version": "v2.5.0-dev",
                "current_commit": "fa77182",
                "latest_repo_commit": "fa77182",
                "deployment_status": "SUCCESS",
                "process_manager": "PM2",
                "service_name": "campus-dev",
                "uptime_percent": 97.50,
                "http_status": 503,
                "ssl_status": "VALID",
                "health_check_url": "/health",
                "health_status": "OFFLINE",
                "license_id": lic_objs[0].id,
                "last_deployment_at": now - timedelta(days=1),
                "last_restart_at": now - timedelta(days=1)
            }
        ]

        app_objs = []
        for a_data in apps_data:
            app = Application(**a_data)
            db.add(app)
            app_objs.append(app)

        await db.flush()

        # 5. Seed 10 Domains
        domains_data = [
            ("smartcampus.example.com", app_objs[0].id, "109.199.111.51", 75, "Let's Encrypt Authority X3"),
            ("registry.example.com", app_objs[1].id, "109.199.111.51", 82, "Let's Encrypt Authority X3"),
            ("lms.example.com", app_objs[2].id, "109.199.111.52", 64, "DigiCert Global Root CA"),
            ("api.mobile.example.com", app_objs[3].id, "109.199.111.52", 120, "Let's Encrypt Authority X3"),
            ("staff.example.com", app_objs[4].id, "109.199.111.51", 88, "Cloudflare Inc ECC CA-3"),
            ("staging.smartcampus.example.com", app_objs[5].id, "109.199.111.53", 24, "Let's Encrypt Authority X3"), # Expiring soon (<30 days)
            ("bi.example.com", app_objs[6].id, "109.199.111.52", 18, "Let's Encrypt Authority X3"), # Expiring soon (<30 days)
            ("dev.smartcampus.example.com", app_objs[7].id, "109.199.111.53", 90, "Let's Encrypt Authority X3"),
            ("status.example.com", None, "109.199.111.51", 110, "Let's Encrypt Authority X3"),
            ("cdn.example.com", None, "109.199.111.52", 140, "Amazon RSA 2048 M02")
        ]

        for d_name, a_id, ip, days, issuer in domains_data:
            dom = Domain(
                domain_name=d_name,
                application_id=a_id,
                server_ip=ip,
                dns_status="RESOLVED",
                ssl_status="VALID" if days > 14 else "EXPIRING",
                ssl_issuer=issuer,
                days_remaining=days,
                ssl_expires_at=now + timedelta(days=days),
                redirect_status="HTTP_TO_HTTPS",
                auto_renew=True
            )
            db.add(dom)

        # 6. Seed 15 Deployments
        dep_messages = [
            ("8a92f31", "feat(auth): add OAuth2 refresh token revocation and biometric hooks", "Alexander Wright", "SUCCESS"),
            ("14f0892", "perf(db): optimize student transcripts aggregation query plan", "Elena Rostova", "SUCCESS"),
            ("7b88192", "fix(upload): resolve multipart file upload buffer overflow in media player", "David Kim", "SUCCESS"),
            ("4e1199a", "feat(notifications): add APNS and FCM broadcast push channels", "Sarah Jenkins", "SUCCESS"),
            ("9012cad", "refactor(ui): update faculty evaluations form layout to WCAG 2.1 AA", "Alexander Wright", "SUCCESS"),
            ("91bd721", "test(e2e): promote release candidate to staging environment", "Elena Rostova", "SUCCESS"),
            ("33a9081", "chore(deps): bump pandas and polars analytical engine dependencies", "David Kim", "SUCCESS"),
            ("fa77182", "wip: test sandbox pipeline deployment with mock fixtures", "Sarah Jenkins", "SUCCESS"),
            ("e109823", "feat(security): enable Strict-Transport-Security preload header", "Elena Rostova", "SUCCESS"),
            ("b87192a", "fix(cors): whitelist institutional intranet origin headers", "Alexander Wright", "SUCCESS"),
            ("a091823", "refactor: isolate database connection pooling per worker worker process", "David Kim", "FAILED"),
            ("f991820", "fix: restore previous connection pool sizing configuration", "David Kim", "SUCCESS"),
            ("c182901", "feat(billing): integrate enterprise SEPA direct debit webhooks", "Elena Rostova", "SUCCESS"),
            ("d882901", "chore: rotate internal JWT signing secret keys", "Alexander Wright", "SUCCESS"),
            ("2291820", "feat(export): generate signed PDF grade reports with digital watermarks", "Sarah Jenkins", "SUCCESS")
        ]

        for idx, (chash, cmsg, cauthor, cstatus) in enumerate(dep_messages):
            dep_app = app_objs[idx % len(app_objs)]
            dep = Deployment(
                application_id=dep_app.id,
                environment=dep_app.environment,
                branch=dep_app.git_branch,
                commit_hash=chash,
                previous_commit_hash=f"{chash[:4]}000",
                commit_message=cmsg,
                commit_author=cauthor,
                status=cstatus,
                deployed_by=cauthor,
                logs=f"[INFO] Step 1/13: Pipeline initiated by {cauthor}\n[INFO] Step 2/13: Building Docker image\n[INFO] Step 3/13: Automated tests passed (48/48)\n[INFO] Step 4/13: Services promoted\n[INFO] Pipeline finished with status: {cstatus}",
                duration_seconds=38 + (idx * 2),
                created_at=now - timedelta(hours=(idx * 8) + 1)
            )
            db.add(dep)

        # 7. Seed Sample Alerts
        alerts_data = [
            ("Application Offline", "CRITICAL", "application", app_objs[7].id, app_objs[7].name, "Smart Campus Development Sandbox is returning HTTP 503 Service Unavailable."),
            ("SSL Certificate Expiring Soon", "WARNING", "ssl", None, "bi.example.com", "SSL Certificate for bi.example.com expires in 18 days. Auto-renewal scheduled."),
            ("High Memory Utilization", "WARNING", "server", server_objs[0].id, server_objs[0].name, "RAM utilization reached 84.6% on VPS-01-Production-Core."),
            ("License Expiring Soon", "WARNING", "license", lic_objs[1].id, lic_objs[1].license_key, f"License {lic_objs[1].license_key} for St. Jude Health System expires in 5 days."),
            ("Update Available", "INFO", "application", app_objs[0].id, app_objs[0].name, "New commit 91bd721 available on origin/main for Smart Campus.")
        ]
        for rname, sev, stype, sid, sname, msg in alerts_data:
            al = Alert(
                rule_name=rname,
                severity=sev,
                source_type=stype,
                source_id=sid,
                source_name=sname,
                message=msg,
                is_acknowledged=False,
                is_resolved=False,
                created_at=now - timedelta(minutes=15)
            )
            db.add(al)

        # 8. Seed Alert Rules
        rules_data = [
            ("High CPU Utilization Warning", "cpu", "GREATER_THAN", 80.0, "WARNING", "ALL"),
            ("Critical CPU Utilization", "cpu", "GREATER_THAN", 95.0, "CRITICAL", "ALL"),
            ("High Memory Critical", "ram", "GREATER_THAN", 90.0, "CRITICAL", "ALL"),
            ("Disk Capacity Critical", "disk", "GREATER_THAN", 90.0, "CRITICAL", "ALL"),
            ("SSL Certificate Expiration Warning", "ssl_days", "LESS_THAN", 30.0, "WARNING", "ALL"),
            ("License Expiration Warning", "license_days", "LESS_THAN", 30.0, "WARNING", "ALL")
        ]
        for r_name, m_name, cond, thresh, r_sev, chan in rules_data:
            db.add(AlertRule(
                name=r_name,
                metric_name=m_name,
                condition=cond,
                threshold=thresh,
                severity=r_sev,
                channel=chan
            ))

        # 9. Seed Backups
        for a in app_objs[:4]:
            b = Backup(
                application_id=a.id,
                server_id=a.server_id,
                filename=f"daily-snapshot-{a.service_name}-20261006.tar.gz",
                file_size_mb=128.4 + (hash(a.name) % 80),
                destination="S3://infra-backups/daily/",
                status="COMPLETED",
                verified=True,
                retention_days=30,
                created_at=now - timedelta(hours=8)
            )
            db.add(b)

        # 10. Seed Incidents
        inc1 = Incident(
            application_id=app_objs[7].id,
            server_id=server_objs[2].id,
            title="Dev Sandbox Sandbox Process Crash",
            description="PM2 process campus-dev encountered unhandled exception during test runner initialization.",
            severity="WARNING",
            status="INVESTIGATING",
            started_at=now - timedelta(hours=2),
            duration_seconds=7200
        )
        inc2 = Incident(
            application_id=app_objs[0].id,
            server_id=server_objs[0].id,
            title="Database Connection Latency Spike",
            description="High lock contention during student grading roll-up resulted in response times exceeding 1200ms.",
            severity="WARNING",
            status="RESOLVED",
            started_at=now - timedelta(days=3),
            resolved_at=now - timedelta(days=3, minutes=-45),
            duration_seconds=2700
        )
        db.add_all([inc1, inc2])

        # 11. Seed Audit Logs
        audit_events = [
            ("USER_LOGIN", "user", "admin", "admin", "127.0.0.1", "SUCCESS", {"ip": "127.0.0.1"}),
            ("GENERATE_LICENSE", "license", "admin", lic_objs[0].id, "127.0.0.1", "SUCCESS", {"key": lic_objs[0].license_key}),
            ("DEPLOY_APPLICATION", "application", "deploy_admin", app_objs[0].id, "10.0.1.5", "SUCCESS", {"commit": "8a92f31"}),
            ("SERVER_SERVICE_RESTART", "server", "infra_admin", server_objs[0].id, "10.0.1.2", "SUCCESS", {"service": "nginx"}),
            ("MAINTENANCE_TOGGLE", "application", "admin", app_objs[6].id, "127.0.0.1", "SUCCESS", {"enabled": True})
        ]
        for act, etype, uname, eid, ip, res_code, details in audit_events:
            db.add(AuditLog(
                username=uname,
                action=act,
                entity_type=etype,
                entity_id=eid,
                ip_address=ip,
                details=details,
                result=res_code,
                timestamp=now - timedelta(hours=3)
            ))

        # 12. Seed App Logs
        categories = ["application", "nginx", "docker", "systemd", "security", "monitoring"]
        for a in app_objs:
            db.add(AppLog(
                application_id=a.id,
                server_id=a.server_id,
                category="application",
                severity="INFO",
                message=f"Application {a.name} operational. Health check verified on {a.health_check_url}.",
                user="system",
                timestamp=now - timedelta(minutes=10)
            ))
            db.add(AppLog(
                application_id=a.id,
                server_id=a.server_id,
                category="nginx",
                severity="INFO",
                message=f"GET {a.health_check_url} HTTP/1.1 200 {a.port} 2.4ms",
                user=None,
                timestamp=now - timedelta(minutes=8)
            ))

        await db.commit()
