import pytest
import pytest_asyncio
import uuid
import time
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.config import settings
from backend.app.core.security import (
    verify_license_signature, generate_ed25519_keypair, sign_license_payload
)
from backend.app.core.init_db import purge_dummy_data

from sqlalchemy import delete
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.entities import Server, Application

@pytest_asyncio.fixture(autouse=True, scope="module")
async def clean_database_after_tests():
    from backend.app.core.init_db import init_db
    await init_db(seed_demo=False)
    yield
    # Clean up test-generated entities while strictly preserving user servers and apps
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Application).where(Application.name.like("Test %") | Application.name.like("MClinic-Git-%") | Application.name.like("Unauthorized%")))
        await db.execute(delete(Server).where(Server.name.like("vps-test-%") | Server.name.like("Git-Test-%") | Server.name.like("VPS-173.249%") | Server.name.like("vps-node-discovery") | Server.name.like("vps-detail-test") | Server.name.like("vps-docker-test") | Server.name.like("snapshot-test-%")))
        await db.commit()

async def get_admin_token(ac: AsyncClient) -> str:
    login_res = await ac.post("/api/auth/login", json={
        "username_or_email": settings.ADMIN_EMAIL,
        "password": settings.ADMIN_PASSWORD
    })
    return login_res.json()["access_token"]

@pytest.mark.asyncio
async def test_auth_login_and_me():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login with valid super admin credentials
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": settings.ADMIN_EMAIL,
            "password": settings.ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        data = login_res.json()
        assert "access_token" in data
        assert data["user"]["role"] == "SUPER_ADMIN"
        token = data["access_token"]

        # 2. Access /api/auth/me
        headers = {"Authorization": f"Bearer {token}"}
        me_res = await ac.get("/api/auth/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["email"] == settings.ADMIN_EMAIL

@pytest.mark.asyncio
async def test_rbac_protection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        admin_token = await get_admin_token(ac)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Create viewer user
        reg_res = await ac.post("/api/admin/users", json={
            "username": "test_viewer_rbac",
            "email": "test_viewer_rbac@enterprise.com",
            "password": "Password123!",
            "full_name": "Test Viewer",
            "role": "READ_ONLY"
        }, headers=admin_headers)
        assert reg_res.status_code in [200, 400]

        # Login as viewer (READ_ONLY)
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "test_viewer_rbac",
            "password": "Password123!"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to create application (requires SUPER_ADMIN or APPLICATION_ADMIN)
        create_res = await ac.post("/api/applications", json={
            "name": "Unauthorized App",
            "domain": "unauth.example.com",
            "service_name": "test-svc"
        }, headers=headers)
        assert create_res.status_code == 403, "Viewer should be denied from creating applications"

@pytest.mark.asyncio
async def test_cryptographic_license_signing_and_verification():
    # 1. Test asymmetric signing directly
    test_payload = {
        "license_id": "LIC-TEST-001",
        "customer": "Test Enterprise Corp",
        "product": "Test Core Suite",
        "version": "v1.0.0"
    }
    payload_b64, sig_b64 = sign_license_payload(test_payload)
    is_valid, decoded_data = verify_license_signature(payload_b64, sig_b64)
    assert is_valid is True
    assert decoded_data["license_id"] == "LIC-TEST-001"

    # 2. Test tampering rejection
    tampered_payload_b64 = payload_b64[:-2] + "AA"
    is_valid_tampered, _ = verify_license_signature(tampered_payload_b64, sig_b64)
    assert is_valid_tampered is False

@pytest.mark.asyncio
async def test_license_online_validation_and_activation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # Dynamically create license via API
        create_res = await ac.post("/api/licenses", json={
            "product_name": "Enterprise Core System",
            "product_version": "v2.0.0",
            "customer_name": "Acme Defense LLC",
            "customer_email": "defense@acme.corp",
            "license_type": "Enterprise",
            "allowed_installations": 5,
            "expires_in_days": 365,
            "features": {"api": True, "clustering": True}
        }, headers=headers)
        assert create_res.status_code == 200
        lic = create_res.json()
        assert "license_key" in lic

        # Online Activation
        act_res = await ac.post("/api/licenses/activate", json={
            "license_key": lic["license_key"],
            "product_name": lic["product_name"],
            "product_version": lic["product_version"],
            "installation_fingerprint": "node-test-hw-fp-9999",
            "hostname": "test-node.enterprise.local",
            "ip_address": "192.168.1.100"
        })
        assert act_res.status_code == 200
        act_data = act_res.json()
        assert act_data["success"] is True
        assert "token" in act_data

        # Online Validation
        val_res = await ac.post("/api/licenses/validate", json={
            "license_key": lic["license_key"],
            "product_name": lic["product_name"],
            "product_version": lic["product_version"],
            "installation_fingerprint": "node-test-hw-fp-9999",
            "hostname": "test-node.enterprise.local"
        })
        assert val_res.status_code == 200
        val_data = val_res.json()
        assert val_data["valid"] is True
        assert val_data["status"] == "ACTIVE"

@pytest.mark.asyncio
async def test_server_command_safeguards():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # Dynamically create test server
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-test-safeguard",
            "hostname": "test.safeguard.net",
            "provider": "Custom VPS",
            "public_ip": "10.0.0.99",
            "ssh_port": 22
        }, headers=headers)
        assert srv_res.status_code == 200
        srv = srv_res.json()

        # 1. Reject dangerous restart without confirmation
        dangerous_fail = await ac.post(f"/api/servers/{srv['id']}/command", json={
            "action": "restart"
        }, headers=headers)
        assert dangerous_fail.status_code == 400
        assert "Dangerous operation safeguard" in dangerous_fail.json()["detail"]

        # 2. Allow restart with valid confirmation
        safe_pass = await ac.post(f"/api/servers/{srv['id']}/command", json={
            "action": "restart",
            "confirmation": "RESTART"
        }, headers=headers)
        assert safe_pass.status_code == 200
        assert safe_pass.json()["success"] is True

@pytest.mark.asyncio
async def test_deployment_pipeline_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # Dynamically create server and application
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-test-deploy",
            "hostname": "deploy.test.local",
            "provider": "AWS EC2",
            "public_ip": "10.0.0.101"
        }, headers=headers)
        assert srv_res.status_code == 200
        server_id = srv_res.json()["id"]

        app_res = await ac.post("/api/applications", json={
            "name": "Test Pipeline App",
            "environment": "production",
            "domain": "test-pipeline.enterprise.local",
            "server_id": server_id,
            "service_name": "test-pipeline-service",
            "process_manager": "Docker"
        }, headers=headers)
        assert app_res.status_code == 200
        app_obj = app_res.json()

        # Trigger deployment pipeline
        dep_res = await ac.post("/api/deployments/trigger", json={
            "application_id": app_obj["id"],
            "environment": app_obj["environment"],
            "branch": "main",
            "commit_hash": "a1b2c3d4e5f6",
            "run_tests": True,
            "create_backup": True
        }, headers=headers)
        assert dep_res.status_code == 200
        dep_data = dep_res.json()
        assert dep_data["status"] == "SUCCESS"
        assert "Step 1/13:" in dep_data["logs"]
        assert "Step 13/13:" in dep_data["logs"]

@pytest.mark.asyncio
async def test_server_connection_and_terminal_execution():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a server
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-test-terminal",
            "hostname": "terminal.test.local",
            "provider": "Custom VPS",
            "public_ip": "127.0.0.1",
            "ssh_port": 22
        }, headers=headers)
        assert srv_res.status_code == 200
        server_id = srv_res.json()["id"]

        # 2. Configure SSH credentials
        cfg_res = await ac.post(f"/api/servers/{server_id}/connect/configure", json={
            "ssh_user": "root",
            "ssh_port": 22,
            "ssh_auth_type": "KEY",
            "connection_type": "SSH"
        }, headers=headers)
        assert cfg_res.status_code == 200
        assert cfg_res.json()["ssh_user"] == "root"

        # 3. Test connection
        test_res = await ac.post(f"/api/servers/{server_id}/connect/test", headers=headers)
        assert test_res.status_code == 200
        assert "latency_ms" in test_res.json()

        # 4. Execute terminal command
        term_res = await ac.post(f"/api/servers/{server_id}/terminal/exec", json={
            "command": "df -h"
        }, headers=headers)
        assert term_res.status_code == 200
        term_data = term_res.json()
        assert "exit_code" in term_data
        assert term_data["command"] == "df -h"

        # 5. Get terminal history
        hist_res = await ac.get(f"/api/servers/{server_id}/terminal/history", headers=headers)
        assert hist_res.status_code == 200
        assert len(hist_res.json()) >= 1

        # 6. Get agent install script
        script_res = await ac.get(f"/api/servers/{server_id}/agent/install-script", headers=headers)
        assert script_res.status_code == 200
        assert "#!/usr/bin/env bash" in script_res.text

@pytest.mark.asyncio
async def test_database_backup_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create server for database backup
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-test-db-backup",
            "hostname": "db.test.local",
            "public_ip": "10.0.0.88"
        }, headers=headers)
        assert srv_res.status_code == 200
        server_id = srv_res.json()["id"]

        # 2. Trigger Database Backup
        bk_res = await ac.post("/api/backups/database", json={
            "server_id": server_id,
            "database_type": "POSTGRESQL",
            "database_name": "production_analytics",
            "retention_days": 30
        }, headers=headers)
        assert bk_res.status_code == 200
        bk_data = bk_res.json()
        assert bk_data["database_type"] == "POSTGRESQL"
        assert bk_data["database_name"] == "production_analytics"
        assert bk_data["verified"] is True
        backup_id = bk_data["id"]

        # 3. List backups filtered by server
        list_res = await ac.get(f"/api/backups?server_id={server_id}", headers=headers)
        assert list_res.status_code == 200
        assert len(list_res.json()) >= 1

        # 4. Download backup archive
        dl_res = await ac.get(f"/api/backups/{backup_id}/download", headers=headers)
        assert dl_res.status_code == 200
        assert len(dl_res.content) > 0

        # 5. Delete backup
        del_res = await ac.delete(f"/api/backups/{backup_id}", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True

@pytest.mark.asyncio
async def test_server_processes_and_website_auto_discovery():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create server
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-node-discovery",
            "hostname": "discovery.kkdes.co.ke",
            "public_ip": "185.192.97.84",
            "ssh_password": "TestPassword123"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # 2. Get processes (guaranteed non-empty list)
        proc_res = await ac.get(f"/api/servers/{srv_id}/processes", headers=headers)
        assert proc_res.status_code == 200
        procs = proc_res.json()
        assert isinstance(procs, list)

        # 3. Trigger hardware probe
        hw_res = await ac.post(f"/api/servers/{srv_id}/discover-system", headers=headers)
        assert hw_res.status_code == 200
        hw_data = hw_res.json()
        assert "specs" in hw_data

        # 4. Trigger website and domain scanner
        scan_res = await ac.post(f"/api/servers/{srv_id}/scan-websites?auto_import=true", headers=headers)
        assert scan_res.status_code == 200
        scan_data = scan_res.json()
        assert "total_discovered" in scan_data
        assert isinstance(scan_data["websites"], list)

@pytest.mark.asyncio
async def test_application_docker_inspection_and_actions(monkeypatch):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create server & application
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-docker-test",
            "hostname": "docker.test.local",
            "public_ip": "10.0.0.77"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        app_res = await ac.post("/api/applications", json={
            "name": "Somesha App",
            "domain": "somesha.kkdes.co.ke",
            "server_id": srv_id,
            "service_name": "somesha-web",
            "port": 3000,
            "process_manager": "Docker"
        }, headers=headers)
        assert app_res.status_code == 200
        app_id = app_res.json()["id"]

        # 2. Deep-inspect Docker container
        insp_res = await ac.get(f"/api/applications/{app_id}/docker/inspect", headers=headers)
        assert insp_res.status_code == 200
        insp_data = insp_res.json()
        assert "container" in insp_data
        assert "recommendations" in insp_data
        assert "quick_commands" in insp_data
        assert len(insp_data["quick_commands"]) >= 5

        # 3. Execute container restart action
        act_res = await ac.post(f"/api/applications/{app_id}/docker/action", json={
            "action": "restart"
        }, headers=headers)
        assert act_res.status_code == 200
        assert "exit_code" in act_res.json()

        # 4. Execute prune containers action
        prune_res = await ac.post(f"/api/applications/{app_id}/docker/action", json={
            "action": "prune_containers"
        }, headers=headers)
        assert prune_res.status_code == 200
        assert "exit_code" in prune_res.json()

        # 5. Execute application lifecycle root action (restart)
        monkeypatch.setattr(
            "backend.app.api.applications.execute_remote_command",
            lambda srv, cmd, working_dir=None, timeout=30: {
                "success": True,
                "command": cmd,
                "stdout": "Container somesha-web restarted successfully",
                "stderr": "",
                "exit_code": 0,
                "duration_ms": 110
            }
        )
        app_act_res = await ac.post(f"/api/applications/{app_id}/action", json={
            "action": "restart"
        }, headers=headers)
        assert app_act_res.status_code == 200
        app_act_data = app_act_res.json()
        assert app_act_data["action"] == "restart"
        assert "command" in app_act_data
        assert "docker restart" in app_act_data["command"]
        assert app_act_data["exit_code"] == 0
        assert app_act_data["status"] == "ONLINE"

        # 6. Execute application lifecycle root action (stop)
        stop_res = await ac.post(f"/api/applications/{app_id}/action", json={
            "action": "stop"
        }, headers=headers)
        assert stop_res.status_code == 200
        stop_data = stop_res.json()
        assert stop_data["status"] == "OFFLINE"
        assert "docker stop" in stop_data["command"]

        # 7. Execute suite action with spaces in container names
        suite_act_res = await ac.post(f"/api/applications/{app_id}/suite/action", json={
            "action": "restart",
            "component_names": ["Central Command Center Suite", "somesha-web"]
        }, headers=headers)
        assert suite_act_res.status_code == 200
        suite_data = suite_act_res.json()
        assert "results" in suite_data
        assert len(suite_data["results"]) == 2


@pytest.mark.asyncio
async def test_web_config_backup_and_troubleshoot_management():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register server
        srv_res = await ac.post("/api/servers", json={
            "public_ip": "10.0.0.99",
            "name": "vps-detail-test",
            "ssh_password": "TestPassword!2026"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # 2. Web config backup (APACHE & NGINX)
        b_res = await ac.post("/api/backups/web-config", json={
            "server_id": srv_id,
            "config_type": "WEB_STACK",
            "retention_days": 14
        }, headers=headers)
        assert b_res.status_code == 200
        b_data = b_res.json()
        assert b_data["status"] == "COMPLETED"
        assert "web-config" in b_data["filename"]
        assert b_data["file_size_mb"] > 0
        backup_id = b_data["id"]

        # 3. Schedule OS reboot
        reb_res = await ac.post(f"/api/servers/{srv_id}/reboot/schedule", json={
            "delay_minutes": 30,
            "reason": "Kernel security patch maintenance"
        }, headers=headers)
        assert reb_res.status_code == 200
        assert reb_res.json()["success"] is True

        # 4. Check reboot status
        stat_res = await ac.get(f"/api/servers/{srv_id}/reboot/status", headers=headers)
        assert stat_res.status_code == 200
        assert stat_res.json()["is_scheduled"] is True

        # 5. Cancel scheduled reboot
        canc_res = await ac.post(f"/api/servers/{srv_id}/reboot/cancel", headers=headers)
        assert canc_res.status_code == 200
        assert canc_res.json()["success"] is True

        # 6. Performance analysis & spikes detection
        perf_res = await ac.get(f"/api/servers/{srv_id}/performance/analysis", headers=headers)
        assert perf_res.status_code == 200
        perf_data = perf_res.json()
        assert "health_grade" in perf_data
        assert "spikes" in perf_data
        assert "preset_commands" in perf_data
        assert len(perf_data["preset_commands"]) >= 5

        # 7. Execute 1-click troubleshoot command
        tb_res = await ac.post(f"/api/servers/{srv_id}/troubleshoot/run", json={
            "command_key": "DROP_CACHES"
        }, headers=headers)
        assert tb_res.status_code == 200
        assert "command" in tb_res.json()


@pytest.mark.asyncio
async def test_databases_docker_and_service_action():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register test server
        srv_res = await ac.post("/api/servers", json={
            "public_ip": "173.249.37.206",
            "name": "VPS-173.249.37.206",
            "ssh_password": "TestPassword!2026"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # 2. Test auto-detect databases
        db_res = await ac.get(f"/api/servers/{srv_id}/databases", headers=headers)
        assert db_res.status_code == 200
        db_data = db_res.json()
        assert "engines" in db_data
        assert "databases" in db_data
        assert "app_connections" in db_data
        assert isinstance(db_data["engines"], list)
        assert isinstance(db_data["databases"], list)

        # 3. Test Docker Suite
        docker_res = await ac.get(f"/api/servers/{srv_id}/docker/suite", headers=headers)
        assert docker_res.status_code == 200
        docker_data = docker_res.json()
        assert "containers" in docker_data
        assert "disk_usage" in docker_data
        assert isinstance(docker_data["containers"], list)
        assert isinstance(docker_data["disk_usage"], list)

        # 4. Test Service Action (fast restart)
        action_res = await ac.post(f"/api/servers/{srv_id}/services/nginx/action", json={
            "action": "restart"
        }, headers=headers)
        assert action_res.status_code == 200
        act_data = action_res.json()
        assert act_data["service"] == "nginx"
        assert act_data["action"] == "restart"

        # 5. Test Troubleshoot Commands (Unmanaged VPS Suite)
        for key in ["RESTART_NGINX", "DOCKER_PS", "UFW_STATUS"]:
            t_res = await ac.post(f"/api/servers/{srv_id}/troubleshoot/run", json={
                "command_key": key
            }, headers=headers)
            assert t_res.status_code == 200
            assert t_res.json()["key"] == key


@pytest.mark.asyncio
async def test_git_status_actions_and_batch_scan():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register test server
        srv_res = await ac.post("/api/servers", json={
            "public_ip": "173.249.37.206",
            "name": "Git-Test-Server",
            "ssh_password": "TestPassword!2026"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # 2. Register test application
        app_res = await ac.post("/api/applications", json={
            "name": "MClinic-Git-App",
            "domain": "app.mclinic.co.ke",
            "server_id": srv_id,
            "port": 8080,
            "app_type": "Web Application",
            "framework": "FastAPI / React",
            "git_branch": "master",
            "current_version": "v1.2.0",
            "service_name": "mclinic-git-svc"
        }, headers=headers)
        assert app_res.status_code == 200
        app_id = app_res.json()["id"]

        # 3. Test GET /api/git/status/{app_id}
        git_res = await ac.get(f"/api/git/status/{app_id}", headers=headers)
        assert git_res.status_code == 200
        git_data = git_res.json()
        assert "branch" in git_data
        assert "current_server_commit" in git_data
        assert "latest_remote_commit" in git_data
        assert "version" in git_data
        assert "is_git_repo" in git_data
        assert "doc_root" in git_data

        # 4. Test POST /api/git/action/{app_id} (pull)
        pull_res = await ac.post(f"/api/git/action/{app_id}", json={
            "action": "pull",
            "branch": "master"
        }, headers=headers)
        assert pull_res.status_code == 200
        pull_data = pull_res.json()
        assert pull_data["action"] == "pull"
        assert "command" in pull_data
        assert "new_commit" in pull_data

        # 5. Test POST /api/git/action/{app_id} (status)
        stat_res = await ac.post(f"/api/git/action/{app_id}", json={
            "action": "status"
        }, headers=headers)
        assert stat_res.status_code == 200
        stat_data = stat_res.json()
        assert stat_data["action"] == "status"

        # 6. Test POST /api/git/scan-all
        scan_res = await ac.post("/api/git/scan-all", headers=headers)
        assert scan_res.status_code == 200
        scan_data = scan_res.json()
        assert scan_data["success"] is True
        assert "total_scanned" in scan_data
        assert "updated_apps" in scan_data

@pytest.mark.asyncio
async def test_domain_ssl_update_and_verification():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register a server node
        srv_res = await ac.post("/api/servers", json={
            "name": "vps-ssl-test-node",
            "hostname": "ssl.test.local",
            "public_ip": "185.192.97.84",
            "ssh_password": "TestPassword123"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        unique_domain = f"test-cert-{uuid.uuid4().hex[:8]}.enterprise.local"

        # 2. Create domain
        dom_res = await ac.post("/api/domains", json={
            "domain_name": unique_domain,
            "server_ip": "185.192.97.84"
        }, headers=headers)
        assert dom_res.status_code == 200
        dom_id = dom_res.json()["id"]

        # 3. Test POST /api/domains/{id}/verify-ssl
        verify_res = await ac.post(f"/api/domains/{dom_id}/verify-ssl", headers=headers)
        assert verify_res.status_code == 200
        verify_data = verify_res.json()
        assert "ssl_status" in verify_data
        assert "days_remaining" in verify_data

        # 4. Test POST /api/domains/{id}/update-ssl
        update_res = await ac.post(f"/api/domains/{dom_id}/update-ssl", headers=headers)
        assert update_res.status_code == 200
        update_data = update_res.json()
        assert update_data["domain_id"] == dom_id
        assert update_data["domain_name"] == unique_domain
        assert "command" in update_data
        assert "ssl_status" in update_data
        assert "exit_code" in update_data
        assert "duration_ms" in update_data
        assert "message" in update_data

        # 5. Verify domain details in GET /api/domains
        list_res = await ac.get("/api/domains", headers=headers)
        assert list_res.status_code == 200
        matched = next((d for d in list_res.json() if d["id"] == dom_id), None)
        assert matched is not None
        assert matched["domain_name"] == unique_domain

        # 6. Clean up
        del_res = await ac.delete(f"/api/domains/{dom_id}", headers=headers)
        assert del_res.status_code == 200

@pytest.mark.asyncio
async def test_license_and_activate_alert():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # Test POST /api/licenses/alerts/{alert_id}/license-and-activate
        alert_machine_id = "SC-TEST-ALERT-NODE-888"
        act_res = await ac.post(f"/api/licenses/alerts/{alert_machine_id}/license-and-activate", json={
            "customer": "Test Institute Node",
            "product": "Smart Campus Access Suite",
            "installation_limit": 3,
            "expires_in_days": 180
        }, headers=headers)
        assert act_res.status_code == 200
        data = act_res.json()
        assert data["success"] is True
        assert data["machine_id"] == alert_machine_id
        assert data["customer"] == "Test Institute Node"
        assert "license_id" in data
        assert "certificate" in data
        assert "-----BEGIN COMMAND CENTER LICENSE PAYLOAD-----" in data["certificate"]

@pytest.mark.asyncio
async def test_server_snapshot_and_revert_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register a test server node
        srv_res = await ac.post("/api/servers", json={
            "name": "snapshot-test-node",
            "hostname": "snapshot.test.local",
            "public_ip": "185.192.97.84",
            "ssh_password": "TestPassword123"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        test_snap_uuid = str(uuid.uuid4())

        with patch("backend.app.api.servers.create_remote_server_snapshot") as mock_create, \
             patch("backend.app.api.servers.revert_remote_server_snapshot") as mock_revert, \
             patch("backend.app.api.servers.delete_remote_server_snapshot") as mock_delete:
            
            mock_create.return_value = {
                "success": True,
                "snapshot_id": test_snap_uuid,
                "file_path": f"/var/backups/hq-snapshots/snapshot-{test_snap_uuid}.tar.gz",
                "size_mb": 1.45,
                "manifest": {"hostname": "snapshot.test.local", "archived_paths": "/etc/nginx /etc/systemd"},
                "stdout": "Snapshot completed",
                "stderr": "",
                "exit_code": 0,
                "duration_ms": 320,
                "message": "Server snapshot created successfully"
            }
            mock_revert.return_value = {
                "success": True,
                "snapshot_id": test_snap_uuid,
                "server_id": srv_id,
                "safety_backup_path": "/var/backups/hq-snapshots/pre-revert-safety.tar.gz",
                "message": "Server successfully reverted to snapshot",
                "duration_ms": 480,
                "stdout": "Pre-revert safety backup created. Services reloaded."
            }
            mock_delete.return_value = {"success": True}

            # 2. Take server snapshot
            snap_res = await ac.post(f"/api/servers/{srv_id}/snapshots", json={
                "name": "Test Nginx & System Snapshot",
                "description": "Pre-deployment configuration backup",
                "snapshot_type": "system_config"
            }, headers=headers)
            assert snap_res.status_code == 200
            snap_data = snap_res.json()
            snap_id = snap_data["id"]
            assert snap_data["name"] == "Test Nginx & System Snapshot"
            assert snap_data["snapshot_type"] == "system_config"
            assert snap_data["server_id"] == srv_id
            assert snap_data["status"] == "COMPLETED"
            assert snap_data["size_mb"] == 1.45

            # 3. List snapshots for server
            list_res = await ac.get(f"/api/servers/{srv_id}/snapshots", headers=headers)
            assert list_res.status_code == 200
            snapshots = list_res.json()
            assert any(s["id"] == snap_id for s in snapshots)

            # 4. Revert to snapshot
            rev_res = await ac.post(f"/api/servers/{srv_id}/snapshots/{snap_id}/revert", headers=headers)
            assert rev_res.status_code == 200
            rev_data = rev_res.json()
            assert rev_data["snapshot_id"] == snap_id
            assert rev_data["server_id"] == srv_id
            assert "message" in rev_data

            # 5. Delete snapshot
            del_res = await ac.delete(f"/api/servers/{srv_id}/snapshots/{snap_id}", headers=headers)
            assert del_res.status_code == 200

            # 6. Verify deleted from active list
            list_after = await ac.get(f"/api/servers/{srv_id}/snapshots", headers=headers)
            assert list_after.status_code == 200
            assert not any(s["id"] == snap_id for s in list_after.json())


@pytest.mark.asyncio
async def test_domain_deep_dive_live_monitoring_and_portable_restore():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a server
        srv_res = await ac.post("/api/servers", json={
            "public_ip": f"198.51.100.{int(time.time()) % 200 + 10}",
            "name": "Target-Cluster-Node",
            "ssh_password": "TestPassword123"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # 2. Create an application
        app_res = await ac.post("/api/applications", json={
            "name": "production-portal",
            "domain": "production-portal.local",
            "server_id": srv_id,
            "framework": "PHP / Laravel",
            "environment": "production",
            "port": 8080,
            "service_name": "portal-web"
        }, headers=headers)
        assert app_res.status_code == 200
        app_id = app_res.json()["id"]

        # 3. Create a domain
        dom_name = f"portal-{int(time.time())}.kkdes.co.ke"
        dom_res = await ac.post("/api/domains", json={
            "domain_name": dom_name,
            "application_id": app_id,
            "server_ip": srv_res.json()["public_ip"],
            "redirect_status": "HTTP_TO_HTTPS",
            "auto_renew": True
        }, headers=headers)
        assert dom_res.status_code == 200
        dom_id = dom_res.json()["id"]

        # 4. Domain Deep-Dive Telemetry
        dd_res = await ac.get(f"/api/domains/{dom_id}/deep-dive", headers=headers)
        assert dd_res.status_code == 200
        dd_data = dd_res.json()
        assert dd_data["domain_name"] == dom_name
        assert "language" in dd_data
        assert "memory_mb" in dd_data
        assert "total_views" in dd_data
        assert "uptime_formatted" in dd_data

        # 5. Domain Service Action (restart)
        act_res = await ac.post(f"/api/domains/{dom_id}/service-action", json={
            "action": "restart"
        }, headers=headers)
        assert act_res.status_code == 200
        assert act_res.json()["action"] == "restart"

        # 6. Domain Backup Config (.conf file)
        conf_res = await ac.get(f"/api/domains/{dom_id}/backup-config", headers=headers)
        assert conf_res.status_code == 200
        assert dom_name in conf_res.text or "VirtualHost" in conf_res.text

        # 7. Live Application Continuous Monitoring
        mon_res = await ac.get(f"/api/monitoring/live/{app_id}", headers=headers)
        assert mon_res.status_code == 200
        mon_data = mon_res.json()
        assert mon_data["application_id"] == app_id
        assert "mem_mb" in mon_data
        assert "terminal_logs" in mon_data
        assert "active_visitors" in mon_data

        # 8. Backup Application
        b_app_res = await ac.post("/api/backups/application", json={
            "application_id": app_id,
            "include_database": True
        }, headers=headers)
        assert b_app_res.status_code == 200
        assert b_app_res.json()["success"] is True

        # 9. Backup Server Config Snapshot
        b_srv_res = await ac.post("/api/backups/server-config", json={
            "server_id": srv_id
        }, headers=headers)
        assert b_srv_res.status_code == 200
        assert b_srv_res.json()["success"] is True

        # 10. Portable Restore Script
        rest_res = await ac.get(f"/api/backups/portable-restore-script/{srv_id}", headers=headers)
        assert rest_res.status_code == 200
        rest_data = rest_res.json()
        assert "tar -xzf" in rest_data["restore_command_sequence"]
        assert "apache2" in rest_data["restore_command_sequence"]
        assert "nginx" in rest_data["restore_command_sequence"]

        # 11. Delete Domain from Server (teardown VirtualHost)
        del_srv_res = await ac.delete(f"/api/domains/{dom_id}/delete-from-server", headers=headers)
        assert del_srv_res.status_code == 200
        assert del_srv_res.json()["success"] is True

        # 12. Verify domain deleted from active list
        list_doms = await ac.get("/api/domains", headers=headers)
        assert not any(d["id"] == dom_id for d in list_doms.json())

@pytest.mark.asyncio
async def test_ai_keys_and_health_diagnostics_engine():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test GET /api/admin/ai-keys
        get_res = await ac.get("/api/admin/ai-keys", headers=headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert "gemini" in data
        assert "openai" in data
        assert "deepseek" in data
        assert "anthropic" in data
        assert "active_provider" in data

        # 2. Test POST /api/admin/ai-keys (saving test keys)
        update_res = await ac.post("/api/admin/ai-keys", json={
            "gemini_api_key": "AIzaSyTestGeminiKey123456789",
            "openai_api_key": "sk-proj-testOpenAiKey123456789",
            "deepseek_api_key": "sk-testDeepSeekKey123456789",
            "anthropic_api_key": "sk-ant-testClaudeKey123456789",
            "active_provider": "gemini"
        }, headers=headers)
        assert update_res.status_code == 200
        up_data = update_res.json()
        assert up_data["gemini"]["configured"] is True
        assert up_data["gemini"]["masked_key"] is not None
        assert up_data["active_provider"] == "gemini"
        assert up_data["has_any_key"] is True

        # 3. Test POST /api/admin/ai-keys/test (test invalid or dummy key handled gracefully)
        test_call = await ac.post("/api/admin/ai-keys/test", json={
            "provider": "gemini"
        }, headers=headers)
        assert test_call.status_code == 200
        t_data = test_call.json()
        assert t_data["provider"] == "gemini"
        assert "success" in t_data
        assert "message" in t_data

        # 4. Test POST /api/monitoring/ai-diagnose
        diag_res = await ac.post("/api/monitoring/ai-diagnose", headers=headers)
        assert diag_res.status_code == 200
        diag_data = diag_res.json()
        assert "status" in diag_data
        assert "provider_used" in diag_data
        assert "model_name" in diag_data
        assert "execution_time_ms" in diag_data
        assert "total_checks" in diag_data
        assert "items" in diag_data
        assert "overall_health_assessment" in diag_data

        # 5. Test POST /api/monitoring/trigger-now with diagnostics
        trig_res = await ac.post("/api/monitoring/trigger-now", headers=headers)
        assert trig_res.status_code == 200
        trig_data = trig_res.json()
        assert trig_data["success"] is True
        assert "diagnostics" in trig_data
        assert "total_checks" in trig_data["diagnostics"]


@pytest.mark.asyncio
async def test_git_pull_deploy_action_flow(monkeypatch):
    from unittest.mock import MagicMock
    from backend.app.api import git as git_module

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register test server
        srv_res = await ac.post("/api/servers", json={
            "public_ip": "10.0.0.155",
            "name": "Pull-Deploy-Server",
            "ssh_password": "TestPassword!2026"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # 2. Register test application
        app_res = await ac.post("/api/applications", json={
            "name": "Afera-Academy-Suite",
            "domain": "afera.kkdes.co.ke",
            "server_id": srv_id,
            "port": 3000,
            "app_type": "Docker Container",
            "framework": "Next.js / Docker",
            "git_branch": "main",
            "current_version": "v1.0.0",
            "service_name": "afera-web"
        }, headers=headers)
        assert app_res.status_code == 200
        app_id = app_res.json()["id"]

        # 3. Mock execute_remote_git_action to return simulated pull + docker build output
        def mock_git_action(server, app, action, branch=None, custom_command=None):
            return {
                "success": True,
                "application_id": app.id,
                "action": action,
                "command": f"git -C /var/www/AFERA pull origin main && cd /var/www/AFERA && docker compose build --no-cache && docker compose up -d && docker image prune -f",
                "stdout": "Updating 15af457..9381585\nFast-forward\n[HQ Docker Build & Swap Pipeline]\nSuccessfully built image\nContainer afera-web Started",
                "stderr": "",
                "exit_code": 0,
                "duration_ms": 3200,
                "new_commit": "9381585abcd1234",
                "new_version": "v1.1.0",
                "update_available": False,
                "repo_dir": "/var/www/AFERA",
                "branch": "main",
                "message": f"Pull & Docker Deploy executed for {app.name} (/var/www/AFERA) on branch 'main'"
            }

        monkeypatch.setattr(git_module, "execute_remote_git_action", mock_git_action)

        # 4. Execute POST /api/git/action/{app_id} with action="pull_deploy"
        act_res = await ac.post(f"/api/git/action/{app_id}", json={
            "action": "pull_deploy",
            "branch": "main"
        }, headers=headers)
        assert act_res.status_code == 200
        data = act_res.json()
        assert data["success"] is True
        assert data["action"] == "pull_deploy"
        assert "docker compose build --no-cache" in data["command"]
        assert "Container afera-web Started" in data["stdout"]
        assert data["new_commit"] == "9381585abcd1234"
        assert data["new_version"] == "v1.1.0"
        assert "Pull & Docker Deploy" in data["message"]

        # 5. Verify application updated in DB
        get_app = await ac.get(f"/api/applications/{app_id}", headers=headers)
        assert get_app.status_code == 200
        app_data = get_app.json()
        assert app_data["current_commit"] == "9381585abcd1234"
        assert app_data["current_version"] == "v1.1.0"
        assert app_data["last_deployment_at"] is not None


@pytest.mark.asyncio
async def test_ai_provider_response_parsers_and_gemini_edge_cases():
    from backend.app.services.ai_diagnostics import (
        extract_gemini_text, extract_openai_text, extract_anthropic_text,
        test_ai_key_connectivity
    )

    # 1. Standard Gemini text response
    std_data = {
        "candidates": [
            {"content": {"parts": [{"text": "OK"}], "role": "model"}, "finishReason": "STOP"}
        ]
    }
    txt, err = extract_gemini_text(std_data)
    assert txt == "OK"
    assert err is None

    # 2. Multi-part Gemini response (thought chunk + text chunk)
    multi_data = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"thought": "Evaluating ping... All good."},
                        {"text": "OK"}
                    ],
                    "role": "model"
                },
                "finishReason": "STOP"
            }
        ]
    }
    txt, err = extract_gemini_text(multi_data)
    assert txt == "OK"
    assert err is None

    # 3. Thought-only Gemini response (reasoning model fallback)
    thought_data = {
        "candidates": [
            {
                "content": {
                    "parts": [{"thought": "Diagnosis complete: all checks normal."}],
                    "role": "model"
                },
                "finishReason": "STOP"
            }
        ]
    }
    txt, err = extract_gemini_text(thought_data)
    assert txt == "Diagnosis complete: all checks normal."
    assert err is None

    # 4. Critical Edge Case: Missing 'parts' key due to MAX_TOKENS exhaustion
    # Previously this crashed with KeyError: 'parts'
    no_parts_data = {
        "candidates": [
            {
                "content": {"role": "model"},
                "finishReason": "MAX_TOKENS"
            }
        ]
    }
    txt, err = extract_gemini_text(no_parts_data)
    assert txt is None
    assert "MAX_TOKENS" in err

    # 5. Safety blocked response (no content key at all)
    safety_data = {
        "candidates": [
            {
                "finishReason": "SAFETY"
            }
        ]
    }
    txt, err = extract_gemini_text(safety_data)
    assert txt is None
    assert "SAFETY" in err

    # 6. Prompt blocked in promptFeedback
    prompt_blocked = {
        "promptFeedback": {
            "blockReason": "PROHIBITED_CONTENT"
        }
    }
    txt, err = extract_gemini_text(prompt_blocked)
    assert txt is None
    assert "PROHIBITED_CONTENT" in err

    # 7. OpenAI safe extraction
    oa_data = {
        "choices": [
            {"message": {"content": "OK", "role": "assistant"}, "finish_reason": "stop"}
        ]
    }
    txt, err = extract_openai_text(oa_data)
    assert txt == "OK"
    assert err is None

    # 8. Anthropic safe extraction
    ant_data = {
        "content": [
            {"type": "text", "text": "OK"}
        ]
    }
    txt, err = extract_anthropic_text(ant_data)
    assert txt == "OK"
    assert err is None


@pytest.mark.asyncio
async def test_domain_vps_association_and_server_teardown():
    import uuid, random
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        test_uid = uuid.uuid4().hex[:8]
        test_ip = f"185.192.{random.randint(100, 250)}.{random.randint(10, 250)}"

        # 1. Register test server
        srv_res = await ac.post("/api/servers", json={
            "public_ip": test_ip,
            "name": f"Teardown-VPS-{test_uid}",
            "ssh_password": "TestPassword!2026"
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]
        srv_ip = srv_res.json()["public_ip"]

        # 2. Register domain mapped to this server
        test_domain_name = f"teardown-{test_uid}.kkdes.co.ke"
        dom_res = await ac.post("/api/domains", json={
            "domain_name": test_domain_name,
            "server_ip": srv_ip,
            "redirect_status": "HTTP_TO_HTTPS",
            "auto_renew": True
        }, headers=headers)
        assert dom_res.status_code == 200
        dom_id = dom_res.json()["id"]

        # 3. Verify GET /api/domains returns server_id and server_name
        list_res = await ac.get("/api/domains", headers=headers)
        assert list_res.status_code == 200
        domains_list = list_res.json()
        target_dom = next((d for d in domains_list if d["id"] == dom_id), None)
        assert target_dom is not None
        assert target_dom["server_id"] == srv_id
        assert target_dom["server_name"] == f"Teardown-VPS-{test_uid}"

        # 4. Execute permanent server teardown & deletion
        del_res = await ac.post(f"/api/domains/{dom_id}/delete-from-server", headers=headers)
        assert del_res.status_code == 200
        del_data = del_res.json()
        assert del_data["success"] is True
        assert del_data["domain_name"] == test_domain_name

        # 5. Verify domain was removed from database
        verify_res = await ac.get("/api/domains", headers=headers)
        assert verify_res.status_code == 200
        remaining_ids = [d["id"] for d in verify_res.json()]
        assert dom_id not in remaining_ids


@pytest.mark.asyncio
async def test_ai_audit_command_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test audit on successful command (exit_code 0)
        audit_res = await ac.post("/api/monitoring/ai-audit-command", json={
            "command": "ps aux --sort=-%cpu | head -20",
            "stdout": "USER PID %CPU %MEM COMMAND\nroot 1234 95.2 3.1 node /app/server.js",
            "stderr": "",
            "exit_code": 0,
            "duration_ms": 320,
            "server_name": "Test-Node-1",
            "context_type": "SPIKE_INVESTIGATION"
        }, headers=headers)
        assert audit_res.status_code == 200
        data = audit_res.json()
        assert data["command"] == "ps aux --sort=-%cpu | head -20"
        assert data["exit_code"] == 0
        assert data["status_level"] in ["SUCCESS", "WARNING", "ERROR"]
        assert len(data["reason"]) > 0
        assert len(data["solution"]) > 0
        assert "suggested_command" in data
        assert "provider_used" in data

        # 2. Test audit on failed command (exit_code 1)
        err_res = await ac.post("/api/monitoring/ai-audit-command", json={
            "command": "apache2ctl configtest",
            "stdout": "",
            "stderr": "AH00526: Syntax error on line 42 of /etc/apache2/sites-enabled/site.conf: Invalid command 'ProxyPassReverse'",
            "exit_code": 1,
            "duration_ms": 110,
            "server_name": "Web-VPS",
            "context_type": "SYNTAX_CHECK"
        }, headers=headers)
        assert err_res.status_code == 200
        err_data = err_res.json()
        assert err_data["exit_code"] == 1
        assert err_data["status_level"] == "ERROR"
        assert len(err_data["reason"]) > 0

        # 3. Test audit on Certbot DNS / Let's Encrypt failure (exit_code 1)
        cert_res = await ac.post("/api/monitoring/ai-audit-command", json={
            "command": "certbot -d mettogroup.com --non-interactive --agree-tos --redirect",
            "stdout": "Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for mettogroup.com\nCertbot failed to authenticate some domains (authenticator: webroot).\n  Domain: mettogroup.com\n  Type: dns\n  Detail: no valid A records found for mettogroup.com\nSome challenges have failed.",
            "stderr": "",
            "exit_code": 1,
            "duration_ms": 2314,
            "server_name": "node-eu-1",
            "context_type": "SSL_CERTBOT_RENEWAL"
        }, headers=headers)
        assert cert_res.status_code == 200
        cert_data = cert_res.json()
        assert cert_data["exit_code"] == 1
        assert cert_data["status_level"] in ["ERROR", "CRITICAL"]
        assert "mettogroup.com" in cert_data["summary"] or "DNS" in cert_data["summary"] or "Certbot" in cert_data["summary"]
        assert "dns" in cert_data["reason"].lower() or "a record" in cert_data["reason"].lower()
        assert len(cert_data["suggested_command"]) > 0


@pytest.mark.asyncio
async def test_ai_autofix_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # Create a test server
        srv_res = await ac.post("/api/servers", json={
            "name": "AutoFix-Test-VPS",
            "public_ip": "172.16.0.50",
            "ssh_port": 22,
            "ssh_user": "root",
            "auth_type": "PASSWORD",
            "ssh_password": "testpassword"
        }, headers=headers)
        assert srv_res.status_code == 200
        server_id = srv_res.json()["id"]

        with patch("backend.app.services.ai_diagnostics.execute_remote_command") as mock_exec:
            mock_exec.return_value = {
                "success": True,
                "stdout": "Restarting nginx... OK\nConfiguration syntax ok.",
                "stderr": "",
                "exit_code": 0,
                "duration_ms": 140
            }

            # 1. Test single autofix endpoint
            fix_res = await ac.post("/api/monitoring/ai-autofix", json={
                "diagnostic_id": "ERR-001",
                "title": "502 Bad Gateway: Reverse Proxy",
                "target": "AutoFix-Test-VPS",
                "target_type": "server",
                "fix_commands": "nginx -t && systemctl reload nginx",
                "server_id": server_id
            }, headers=headers)
            assert fix_res.status_code == 200
            data = fix_res.json()
            assert data["success"] is True
            assert data["diagnostic_id"] == "ERR-001"
            assert data["exit_code"] == 0
            assert "Restarting nginx" in data["stdout"]
            assert data["server_id"] == server_id

            # 2. Test batch autofix endpoint
            batch_res = await ac.post("/api/monitoring/ai-autofix-all", json={
                "items": [
                    {
                        "diagnostic_id": "ERR-001",
                        "title": "502 Bad Gateway",
                        "target": "AutoFix-Test-VPS",
                        "fix_commands": "systemctl restart nginx",
                        "server_id": server_id
                    },
                    {
                        "diagnostic_id": "ERR-002",
                        "title": "SSL Validation Error",
                        "target": "AutoFix-Test-VPS",
                        "fix_commands": "certbot renew",
                        "server_id": server_id
                    }
                ],
                "server_id": server_id
            }, headers=headers)
            assert batch_res.status_code == 200
            b_data = batch_res.json()
            assert b_data["success"] is True
            assert b_data["total_attempted"] == 2
            assert b_data["total_successful"] == 2

@pytest.mark.asyncio
async def test_system_database_export_restore_and_persistent_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test GET /api/backups/system/status
        status_res = await ac.get("/api/backups/system/status", headers=headers)
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert "db_engine" in status_data
        assert "persistent_storage_active" in status_data
        assert "counts" in status_data
        assert status_data["session_retention_days"] == 365

        # 2. Test POST /api/backups/system/export
        export_res = await ac.post("/api/backups/system/export", headers=headers)
        assert export_res.status_code == 200
        assert "hq_system_backup" in export_res.headers.get("content-disposition", "")
        export_json = export_res.json()
        assert export_json["hq_backup_version"] == "1.0"
        assert "servers" in export_json
        assert "applications" in export_json
        assert "domains" in export_json

        # 3. Test POST /api/backups/system/restore
        restore_res = await ac.post("/api/backups/system/restore", json=export_json, headers=headers)
        assert restore_res.status_code == 200
        restore_data = restore_res.json()
        assert restore_data["success"] is True
        assert "restored_counts" in restore_data
        assert restore_data["restored_counts"]["servers"] >= 0

        # 4. Test Resilient Persistent Token Auth (e.g. after container rebuild / UUID shift)
        # Create a token containing only username
        from backend.app.core.security import create_access_token
        rebuild_token = create_access_token(data={"sub": "synthetic-new-rebuild-uuid", "username": settings.ADMIN_USERNAME, "role": "SUPER_ADMIN"})
        rebuild_headers = {"Authorization": f"Bearer {rebuild_token}"}
        
        me_res = await ac.get("/api/auth/me", headers=rebuild_headers)
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["username"] == settings.ADMIN_USERNAME
        assert me_data["role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_domain_dns_resolution_and_website_troubleshooting():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        unique_domain = f"metto-dns-test-{uuid.uuid4().hex[:6]}.local"
        # 1. Register a domain with a local/test IP to verify DNS resolution fields
        dom_res = await ac.post("/api/domains", json={
            "domain_name": unique_domain,
            "server_ip": "62.171.190.16",
            "redirect_status": "HTTP_TO_HTTPS",
            "auto_renew": True
        }, headers=headers)
        assert dom_res.status_code == 200
        dom_data = dom_res.json()
        dom_id = dom_data["id"]
        assert "resolved_ip" in dom_data
        assert "dns_matches_server" in dom_data
        assert dom_data["server_ip"] == "62.171.190.16"
        assert dom_data["resolved_ip"] == "127.0.0.1"
        assert dom_data["dns_matches_server"] is False

        # 2. List domains and verify resolved_ip & dns_matches_server are populated
        list_res = await ac.get("/api/domains", headers=headers)
        assert list_res.status_code == 200
        domains_list = list_res.json()
        matched_dom = next((d for d in domains_list if d["id"] == dom_id), None)
        assert matched_dom is not None
        assert "resolved_ip" in matched_dom
        assert "dns_matches_server" in matched_dom

        # 3. Verify All Domains DNS endpoint
        verify_all_res = await ac.post("/api/domains/verify-dns-all", headers=headers)
        assert verify_all_res.status_code == 200
        v_data = verify_all_res.json()
        assert v_data["success"] is True
        assert "matched" in v_data
        assert "mismatched" in v_data
        assert "unresolved" in v_data

        # 4. Run Website Troubleshooting tools on the domain
        for tool_name in ["dns_ping", "http_probe", "vhost_syntax"]:
            tb_res = await ac.post(f"/api/domains/{dom_id}/troubleshoot", json={
                "tool": tool_name
            }, headers=headers)
            assert tb_res.status_code == 200
            tb_data = tb_res.json()
            assert tb_data["domain_id"] == dom_id
            assert tb_data["tool"] == tool_name
            assert "command" in tb_data
            assert "stdout" in tb_data
            assert "summary" in tb_data
            assert "resolved_ip" in tb_data

        await ac.delete(f"/api/domains/{dom_id}", headers=headers)


@pytest.mark.asyncio
async def test_per_site_git_resolution_no_substring_hijack():
    """Verify that build_allowed_names_for_app and applications self-healing prevent 'afera' from hijacking unrelated 'afera*' domains."""
    from backend.app.services.remote_executor import build_allowed_names_for_app

    # 1. Verify build_allowed_names_for_app does NOT include 'afera' for 'aferainnov.africa' or 'lms.aferaacademy.africa'
    allowed_innov = build_allowed_names_for_app("aferainnov.africa", "aferainnov.africa", "apache2", False)
    assert "aferainnov" in allowed_innov
    assert "afera" not in allowed_innov

    allowed_lms = build_allowed_names_for_app("lms.aferaacademy.africa", "lms.aferaacademy.africa", "apache2", False)
    assert "lms.aferaacademy" in allowed_lms
    assert "lms-aferaacademy" in allowed_lms
    assert "aferaacademy" not in allowed_lms
    assert "afera" not in allowed_lms

    allowed_kkdes = build_allowed_names_for_app("aferaacadmy.kkdes.co.ke", "aferaacadmy.kkdes.co.ke", "apache2", False)
    assert "aferaacadmy" in allowed_kkdes
    assert "afera" not in allowed_kkdes

    # Docker app 'afera_web_1' should legitimately match 'afera'
    allowed_docker = build_allowed_names_for_app("afera_web_1", "aferaacademy.africa", "docker:afera_web_1", True)
    assert "afera" in allowed_docker

    # 2. Verify GET /api/applications self-heals non-Docker domain apps whose root_path/current_commit was hijacked by 'afera'
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        srv_res = await ac.post("/api/servers", json={
            "name": f"VPS-173.249.37.206-{uuid.uuid4().hex[:4]}",
            "hostname": "vps-173-249-37-206.local",
            "provider": "Custom VPS",
            "public_ip": "173.249.37.206",
            "ssh_port": 22
        }, headers=headers)
        assert srv_res.status_code == 200
        srv_id = srv_res.json()["id"]

        # Create a non-Docker website row that was previously hijacked by '/var/www/afera' and commit 'c0f79bd'
        hijacked_res = await ac.post("/api/applications", json={
            "server_id": srv_id,
            "name": "aferainnov.africa",
            "environment": "production",
            "app_type": "Apache2 VirtualHost",
            "process_manager": "Apache",
            "root_path": "/var/www/afera",
            "domain": "aferainnov.africa",
            "service_name": "apache2-aferainnov.africa",
            "git_branch": "main"
        }, headers=headers)
        assert hijacked_res.status_code == 200
        hijacked_id = hijacked_res.json()["id"]

        # Simulate the persisted hijacked commit in DB
        from sqlalchemy import select as sa_select
        async with AsyncSessionLocal() as db:
            res_db = await db.execute(sa_select(Application).where(Application.id == hijacked_id))
            db_app = res_db.scalar_one()
            db_app.current_commit = "c0f79bd"
            db_app.root_path = "/var/www/afera"
            await db.commit()

        # List applications and confirm self-healing clears the hijacked commit from aferainnov.africa
        apps_res = await ac.get("/api/applications", headers=headers)
        assert apps_res.status_code == 200
        apps_list = apps_res.json()
        healed_app = next((a for a in apps_list if a["id"] == hijacked_id), None)
        assert healed_app is not None
        assert healed_app["current_commit"] is None
        assert healed_app["root_path"] == "/var/www/aferainnov.africa"

        await ac.delete(f"/api/applications/{hijacked_id}", headers=headers)
        await ac.delete(f"/api/servers/{srv_id}", headers=headers)


@pytest.mark.asyncio
async def test_comprehensive_dashboard_overview_insights():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        res = await ac.get("/api/dashboard/metrics", headers=headers)
        assert res.status_code == 200
        body = res.json()

        # Verify all comprehensive Overview telemetry sections exist
        assert "applications" in body
        assert "total_containers" in body["applications"]
        assert "suites_count" in body["applications"]
        assert "runtimes" in body["applications"]
        assert "ports" in body["applications"]
        assert "servers" in body
        assert "nodes" in body["servers"]
        assert "ssl" in body
        assert "dns_matching_server" in body["ssl"]
        assert "git" in body
        assert "tracked_count" in body["git"]
        assert "app_insights" in body
        assert isinstance(body["app_insights"], list)
        assert "domain_insights" in body
        assert isinstance(body["domain_insights"], list)


@pytest.mark.asyncio
async def test_smtp_and_email_notifications():
    from unittest.mock import patch
    from backend.app.services.email_service import (
        notify_login_event,
        notify_outage_event,
        notify_ssl_expiry_event,
        notify_dns_mismatch_event
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = await get_admin_token(ac)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. GET initial SMTP config
        get_res = await ac.get("/api/notifications/smtp", headers=headers)
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert "host" in get_data
        assert "port" in get_data
        assert "is_enabled" in get_data
        assert "recipients" in get_data

        # 2. POST save new SMTP config
        save_payload = {
            "host": "smtp.mailgun.org",
            "port": 587,
            "username": "postmaster@hq.kkdes.co.ke",
            "password": "MockPassword123!",
            "sender_email": "alerts@hq.kkdes.co.ke",
            "sender_name": "HQ Monitoring Gateway",
            "encryption": "STARTTLS",
            "is_enabled": True,
            "notify_on_login": True,
            "notify_on_outage": True,
            "notify_on_ssl_expiry": True,
            "notify_on_dns_mismatch": True,
            "notify_on_failed_deployment": True,
            "notify_on_critical_alert": True,
            "recipients": ["admin@kkdes.co.ke", "ops@kkdes.co.ke"]
        }
        post_res = await ac.post("/api/notifications/smtp", json=save_payload, headers=headers)
        assert post_res.status_code == 200
        assert post_res.json()["success"] is True

        # Verify saved config reflects in GET
        verify_res = await ac.get("/api/notifications/smtp", headers=headers)
        assert verify_res.status_code == 200
        v_data = verify_res.json()
        assert v_data["configured"] is True
        assert v_data["host"] == "smtp.mailgun.org"
        assert v_data["sender_email"] == "alerts@hq.kkdes.co.ke"
        assert v_data["has_password"] is True
        assert "admin@kkdes.co.ke" in v_data["recipients"]

        # 3. Test SMTP Test Email Endpoint with mocked dispatch
        with patch("backend.app.api.notifications.send_email_async") as mock_send:
            mock_send.return_value = {
                "success": True,
                "duration_ms": 45,
                "message": "Email dispatched successfully"
            }
            test_res = await ac.post("/api/notifications/smtp/test", json={
                "recipient": "admin@kkdes.co.ke"
            }, headers=headers)
            assert test_res.status_code == 200
            t_body = test_res.json()
            assert t_body["success"] is True
            assert t_body["duration_ms"] == 45

        # 4. GET Notification Logs
        logs_res = await ac.get("/api/notifications/logs?limit=20", headers=headers)
        assert logs_res.status_code == 200
        assert isinstance(logs_res.json(), list)

        # 5. Verify High-Level Notification Trigger Helpers Execute Cleanly
        with patch("backend.app.services.email_service.send_email_async") as mock_event_send:
            mock_event_send.return_value = {"success": True, "duration_ms": 30}
            await notify_login_event("admin", "192.168.1.100", "Mozilla/5.0")
            await notify_outage_event("Smart Campus", "smartcampus.example.com", "VPS-01", "185.192.97.84", "OFFLINE", "HTTP 502")
            await notify_ssl_expiry_event("hq.kkdes.co.ke", 14, "Let's Encrypt", "185.192.97.84")
            await notify_dns_mismatch_event("domain.com", "185.192.97.84", "104.21.45.12")
            assert mock_event_send.call_count >= 1
