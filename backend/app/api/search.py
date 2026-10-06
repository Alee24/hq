from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.models.entities import User, Application, Server, Domain, License, AppLog
from backend.app.schemas.api_schemas import GlobalSearchResult

router = APIRouter(prefix="/search", tags=["Global Search"])

@router.get("", response_model=List[GlobalSearchResult])
async def global_search(
    q: str = Query(..., min_length=1, description="Search keyword"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    keyword = f"%{q.strip()}%"
    results: List[GlobalSearchResult] = []

    # 1. Search Applications
    app_res = await db.execute(
        select(Application).where(
            (Application.name.ilike(keyword)) |
            (Application.domain.ilike(keyword)) |
            (Application.current_commit.ilike(keyword))
        ).limit(10)
    )
    for app in app_res.scalars().all():
        results.append(GlobalSearchResult(
            type="application",
            id=app.id,
            title=app.name,
            subtitle=f"{app.domain} ({app.environment.upper()})",
            status=app.health_status,
            url=f"/applications/{app.id}"
        ))

    # 2. Search Servers & IPs
    srv_res = await db.execute(
        select(Server).where(
            (Server.name.ilike(keyword)) |
            (Server.hostname.ilike(keyword)) |
            (Server.public_ip.ilike(keyword)) |
            (Server.provider.ilike(keyword))
        ).limit(10)
    )
    for srv in srv_res.scalars().all():
        results.append(GlobalSearchResult(
            type="server",
            id=srv.id,
            title=srv.name,
            subtitle=f"IP: {srv.public_ip} • Host: {srv.hostname}",
            status=srv.status,
            url=f"/servers"
        ))

    # 3. Search Domains
    dom_res = await db.execute(
        select(Domain).where(Domain.domain_name.ilike(keyword)).limit(10)
    )
    for dom in dom_res.scalars().all():
        results.append(GlobalSearchResult(
            type="domain",
            id=dom.id,
            title=dom.domain_name,
            subtitle=f"SSL: {dom.ssl_status} ({dom.days_remaining}d left) • IP: {dom.server_ip}",
            status=dom.ssl_status,
            url=f"/domains"
        ))

    # 4. Search Licenses
    lic_res = await db.execute(
        select(License).where(
            (License.license_key.ilike(keyword)) |
            (License.product_name.ilike(keyword)) |
            (License.customer_name.ilike(keyword))
        ).limit(10)
    )
    for lic in lic_res.scalars().all():
        results.append(GlobalSearchResult(
            type="license",
            id=lic.id,
            title=lic.license_key,
            subtitle=f"{lic.product_name} • Customer: {lic.customer_name}",
            status=lic.status,
            url=f"/licenses"
        ))

    # 5. Search Users
    user_res = await db.execute(
        select(User).where(
            (User.username.ilike(keyword)) |
            (User.email.ilike(keyword))
        ).limit(5)
    )
    for u in user_res.scalars().all():
        results.append(GlobalSearchResult(
            type="user",
            id=u.id,
            title=u.username,
            subtitle=f"{u.email} ({u.role})",
            status="ACTIVE" if u.is_active else "INACTIVE",
            url=f"/admin/users"
        ))

    return results
