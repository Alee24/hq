import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.security import (
    verify_license_signature, generate_ed25519_keypair, sign_license_payload
)
from backend.app.core.init_db import purge_dummy_data

@pytest_asyncio.fixture(autouse=True, scope="module")
async def clean_database_after_tests():
    yield
    # Purge test residues to preserve a pristine production database state
    await purge_dummy_data()

@pytest.mark.asyncio
async def test_auth_login_and_me():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login with valid super admin credentials
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Password123!"
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
        assert me_res.json()["username"] == "admin"

@pytest.mark.asyncio
async def test_rbac_protection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Super admin creates a read-only viewer user
        admin_login = await ac.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Password123!"
        })
        admin_token = admin_login.json()["access_token"]
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
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
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
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
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
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
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
