import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.security import (
    verify_license_signature, generate_ed25519_keypair, sign_license_payload
)

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
        # Login as viewer (READ_ONLY)
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "viewer",
            "password": "Password123!"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to create application (requires SUPER_ADMIN or APPLICATION_ADMIN)
        create_res = await ac.post("/api/applications", json={
            "name": "Unauthorized App",
            "domain": "unauth.example.com",
            "server_id": "test",
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
        # Get first seeded license
        login_res = await ac.post("/api/auth/login", json={
            "username_or_email": "admin",
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        lics_res = await ac.get("/api/licenses", headers=headers)
        assert lics_res.status_code == 200
        lics = lics_res.json()
        assert len(lics) > 0
        lic = lics[0]

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

        srvs_res = await ac.get("/api/servers", headers=headers)
        assert srvs_res.status_code == 200
        srv = srvs_res.json()[0]

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

        apps_res = await ac.get("/api/applications", headers=headers)
        assert apps_res.status_code == 200
        app_obj = apps_res.json()[0]

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
