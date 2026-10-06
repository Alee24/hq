from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.models.entities import User, Server, Application, Domain

router = APIRouter(prefix="/topology", tags=["Infrastructure Topology"])

@router.get("")
async def get_infrastructure_topology(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    servers_res = await db.execute(select(Server).where(Server.is_active == True, Server.deleted_at == None))
    servers = servers_res.scalars().all()

    apps_res = await db.execute(select(Application).where(Application.is_active == True, Application.deleted_at == None))
    applications = apps_res.scalars().all()

    nodes = [
        {
            "id": "gateway-internet",
            "type": "gateway",
            "label": "Public Internet Gateway",
            "status": "ONLINE",
            "metadata": {"protocols": ["BGP", "Anycast", "IPv4/IPv6"]}
        },
        {
            "id": "edge-firewall",
            "type": "firewall",
            "label": "Enterprise Perimeter Firewall / WAF",
            "status": "ONLINE",
            "metadata": {"rules_active": 420, "blocked_24h": 14200}
        }
    ]

    edges = [
        {"from": "gateway-internet", "to": "edge-firewall", "label": "WAN Traffic"}
    ]

    for srv in servers:
        srv_node_id = f"server-{srv.id}"
        nodes.append({
            "id": srv_node_id,
            "type": "server",
            "label": srv.name,
            "status": srv.status,
            "metadata": {
                "ip": srv.public_ip,
                "provider": srv.provider,
                "os": f"{srv.os} {srv.os_version}",
                "cores": srv.cpu_cores,
                "ram_mb": srv.ram_total_mb
            }
        })
        edges.append({"from": "edge-firewall", "to": srv_node_id, "label": srv.public_ip})

        # Apps on this server
        server_apps = [a for a in applications if a.server_id == srv.id]
        for app in server_apps:
            app_node_id = f"app-{app.id}"
            nodes.append({
                "id": app_node_id,
                "type": "application",
                "label": app.name,
                "status": app.health_status,
                "metadata": {
                    "domain": app.domain,
                    "env": app.environment,
                    "manager": app.process_manager,
                    "service": app.service_name,
                    "version": app.current_version,
                    "commit": app.current_commit
                }
            })
            edges.append({"from": srv_node_id, "to": app_node_id, "label": f":{app.port}"})

    return {
        "nodes": nodes,
        "edges": edges,
        "summary": {
            "total_servers": len(servers),
            "total_applications": len(applications)
        }
    }
