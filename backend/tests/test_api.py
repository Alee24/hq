import pytest
import pytest_asyncio
import uuid
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
    yield
    # Clean up test-generated entities while strictly preserving user servers and apps
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Application).where(Application.name.like("Test %") | Application.name.like("MClinic-Git-%") | Application.name.like("Unauthorized%")))
        await db.execute(delete(Server).where(Server.name.like("vps-test-%") | Server.name.like("Git-Test-%") | Server.name.like("VPS-173.249%") | Server.name.like("vps-node-discovery") | Server.name.like("vps-detail-test") | Server.name.like("vps-docker-test")))
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
async def test_application_docker_inspection_and_actions():
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







