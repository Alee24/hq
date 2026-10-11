import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.config import settings

@pytest.mark.asyncio
async def test_suite_grouping_and_component_actions():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Super Admin
        login_res = await client.post(
            f"{settings.API_V1_STR}/auth/login",
            json={"username_or_email": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Test GET /api/applications with group_suites=true
        apps_res = await client.get(f"{settings.API_V1_STR}/applications?group_suites=true", headers=headers)
        assert apps_res.status_code == 200
        apps_data = apps_res.json()
        assert isinstance(apps_data, list)

        # 3. Check for any suite in the grouped list
        for app_item in apps_data:
            assert "id" in app_item
            assert "name" in app_item
            assert "health_status" in app_item
            if app_item.get("is_suite"):
                assert "components" in app_item
                assert isinstance(app_item["components"], list)
                assert app_item["component_count"] == len(app_item["components"])
                for comp in app_item["components"]:
                    assert "role" in comp
                    assert "role_label" in comp
                    assert "port" in comp
