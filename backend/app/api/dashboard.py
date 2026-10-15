import asyncio
import os
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.models.entities import (
    User, Application, Server, License, Deployment, Alert, Incident, Domain, Backup
)
from backend.app.schemas.api_schemas import ApplicationResponse
from backend.app.api.applications import group_applications_list, extract_suite_key
from backend.app.services.remote_executor import (
    resolve_domain_dns_live, build_allowed_names_for_app
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/metrics")
async def get_dashboard_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 1. Fetch Servers
    srv_res = await db.execute(
        select(Server).where(Server.is_active == True, Server.deleted_at == None)
    )
    servers = srv_res.scalars().all()
    server_map: Dict[str, Server] = {s.id: s for s in servers}

    server_total = len(servers)
    server_online = sum(1 for s in servers if s.status == "ONLINE")
    server_offline = sum(1 for s in servers if s.status == "OFFLINE")

    # 2. Fetch Applications & Self-Heal Stale Substring-Hijacked Commits
    apps_res = await db.execute(
        select(Application).where(Application.is_active == True, Application.deleted_at == None)
    )
    apps = apps_res.scalars().all()

    subdir_names = {
        "public", "public_html", "html", "dist", "build", "web", "www",
        "current", "release", "releases", "frontend", "backend", "client",
        "server", "api", "app", "src", "out", "static", "httpdocs", "htdocs"
    }
    commit_groups: Dict[tuple, List[Application]] = {}
    for app in apps:
        if app.current_commit and app.server_id:
            commit_groups.setdefault((app.server_id, app.current_commit), []).append(app)

    healed_any = False
    for (_, _), grp in commit_groups.items():
        suite_keys = {extract_suite_key(a.name, a.app_type) or f"standalone-{a.id}" for a in grp}
        for a in grp:
            dom_c = (a.domain or "").lower().strip()
            rp_c = (a.root_path or "").lower().strip().rstrip("/")
            is_dock = bool(
                (rp_c and rp_c.startswith("/var/lib/docker"))
                or dom_c.endswith(".local")
                or (a.process_manager and "docker" in a.process_manager.lower())
                or (a.app_type and "docker" in a.app_type.lower())
            )
            if not is_dock and rp_c:
                allowed = build_allowed_names_for_app(a.name, a.domain, a.service_name, is_docker=False)
                rp_base = os.path.basename(rp_c)
                rp_parent = os.path.basename(os.path.dirname(rp_c))
                was_substring_hijacked = bool(
                    len(suite_keys) > 1
                    or (rp_base and len(rp_base) >= 3 and (rp_base in dom_c or rp_base in a.name.lower()))
                )
                if was_substring_hijacked and rp_base not in allowed and not (rp_base in subdir_names and rp_parent in allowed):
                    a.current_commit = None
                    a.latest_repo_commit = None
                    a.git_branch = None
                    a.repo_url = None
                    if dom_c and not dom_c.endswith(".local"):
                        a.root_path = f"/var/www/{dom_c}"
                    healed_any = True
    if healed_any:
        await db.commit()

    # Build enriched ApplicationResponse objects and consolidate Docker Suites
    enriched_apps: List[ApplicationResponse] = []
    for a in apps:
        srv = server_map.get(a.server_id) if a.server_id else None
        resp = ApplicationResponse.model_validate(a)
        resp.server_name = srv.name if srv else "VPS Node"
        resp.server_ip = srv.public_ip if srv else "127.0.0.1"
        resp.license_status = "VALID"
        enriched_apps.append(resp)

    consolidated_apps = group_applications_list(enriched_apps)

    # 3. Fetch Domains & Resolve Live DNS IPs Concurrently
    dom_res = await db.execute(select(Domain).where(Domain.is_active == True))
    domains = dom_res.scalars().all()

    async def _resolve_safe(dom_name: str) -> Dict[str, Any]:
        if not dom_name or dom_name.endswith(".local"):
            return {"resolved_ip": None, "resolved_ips": []}
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(resolve_domain_dns_live, dom_name, ""),
                timeout=1.5
            )
        except Exception:
            return {"resolved_ip": None, "resolved_ips": []}

    unique_domain_names = list({
        d.domain_name.strip().lower() for d in domains if d.domain_name
    } | {
        a.domain.strip().lower() for a in consolidated_apps if a.domain and not a.domain.endswith(".local")
    })

    dns_results_list = await asyncio.gather(*[_resolve_safe(dn) for dn in unique_domain_names])
    dns_cache: Dict[str, Dict[str, Any]] = dict(zip(unique_domain_names, dns_results_list))

    # Map domains by name and by application_id
    app_by_id: Dict[str, Application] = {a.id: a for a in apps}
    domain_by_name: Dict[str, Domain] = {d.domain_name.lower(): d for d in domains if d.domain_name}
    domain_by_app_id: Dict[str, Domain] = {d.application_id: d for d in domains if d.application_id}

    domain_insights: List[Dict[str, Any]] = []
    dns_matching_server = 0
    dns_mismatch_or_proxy = 0
    dns_unresolved = 0
    ssl_valid_count = 0
    ssl_expiring_soon = 0
    ssl_expired_or_none = 0

    for d in domains:
        linked_app = app_by_id.get(d.application_id) if d.application_id else None
        srv = server_map.get(linked_app.server_id) if (linked_app and linked_app.server_id) else (servers[0] if len(servers) == 1 else None)
        srv_ip = srv.public_ip if srv else None

        d_clean = (d.domain_name or "").strip().lower()
        dns_info = dns_cache.get(d_clean, {"resolved_ip": None, "resolved_ips": []})
        res_ip = dns_info.get("resolved_ip")
        res_ips = dns_info.get("resolved_ips") or []

        matches_srv: Optional[bool] = None
        if srv_ip and res_ips:
            matches_srv = srv_ip in res_ips
            if matches_srv:
                dns_matching_server += 1
            else:
                dns_mismatch_or_proxy += 1
        elif not res_ip:
            dns_unresolved += 1

        days_rem = d.days_remaining if d.days_remaining is not None else 0
        if d.ssl_status in ["NONE", "EXPIRED"] or days_rem <= 0:
            ssl_expired_or_none += 1
        elif days_rem <= 30:
            ssl_expiring_soon += 1
        else:
            ssl_valid_count += 1

        domain_insights.append({
            "id": d.id,
            "domain_name": d.domain_name,
            "application_id": d.application_id,
            "application_name": linked_app.name if linked_app else "Standalone VirtualHost",
            "server_id": srv.id if srv else None,
            "server_name": srv.name if srv else "Unassigned",
            "server_ip": srv_ip,
            "resolved_ip": res_ip,
            "resolved_ips": res_ips,
            "dns_matches_server": matches_srv,
            "ssl_status": d.ssl_status,
            "days_remaining": days_rem,
            "issuer": getattr(d, "ssl_issuer", None) or "Let's Encrypt",
            "auto_renew": getattr(d, "auto_renew_enabled", True),
        })

    # 4. Compute Consolidated Application & Runtime Metrics
    app_total = len(consolidated_apps)
    total_containers = len(apps)
    suites_count = sum(1 for a in consolidated_apps if a.is_suite)
    standalone_count = app_total - suites_count

    app_online = sum(1 for a in consolidated_apps if a.health_status == "ONLINE")
    app_degraded = sum(1 for a in consolidated_apps if a.health_status == "DEGRADED")
    app_offline = sum(1 for a in consolidated_apps if a.health_status == "OFFLINE")
    app_maintenance = sum(1 for a in consolidated_apps if a.is_maintenance)
    avg_uptime = round(sum((a.uptime_percent or 99.98) for a in consolidated_apps) / app_total, 2) if app_total > 0 else 100.0

    # Runtime distribution
    docker_count = sum(
        1 for a in consolidated_apps
        if a.is_suite or (a.process_manager and "docker" in a.process_manager.lower())
    )
    apache_count = sum(
        1 for a in consolidated_apps
        if not a.is_suite and a.process_manager and "apache" in a.process_manager.lower()
    )
    nginx_count = sum(
        1 for a in consolidated_apps
        if not a.is_suite and a.process_manager and "nginx" in a.process_manager.lower()
    )
    other_runtime_count = max(0, app_total - docker_count - apache_count - nginx_count)

    # Environment distribution
    env_prod = sum(1 for a in consolidated_apps if (a.environment or "").lower() == "production")
    env_stage = sum(1 for a in consolidated_apps if (a.environment or "").lower() == "staging")
    env_dev = max(0, app_total - env_prod - env_stage)

    # Port allocation & conflict check
    active_ports = sorted({a.port for a in consolidated_apps if a.port})
    port_map: Dict[str, List[str]] = {}
    for a in consolidated_apps:
        if a.port and a.port not in (80, 443):
            key = f"{a.server_id or 'default'}:{a.port}"
            port_map.setdefault(key, []).append(a.name)
    port_collisions = [
        {"port": int(k.split(":")[1]), "apps": names}
        for k, names in port_map.items() if len(names) > 1
    ]

    # Git repository & commit telemetry
    tracked_git_count = sum(
        1 for a in consolidated_apps
        if a.current_commit and a.current_commit != "HEAD"
    )
    untracked_git_count = app_total - tracked_git_count
    pending_updates = sum(
        1 for a in consolidated_apps
        if a.current_commit and a.latest_repo_commit
        and a.current_commit != "HEAD"
        and a.current_commit != a.latest_repo_commit
    )
    up_to_date_git_count = max(0, tracked_git_count - pending_updates)

    # Build rich app_insights array for the Overview Application Intelligence Matrix
    app_insights: List[Dict[str, Any]] = []
    for a in consolidated_apps:
        dom_clean = (a.domain or "").strip().lower()
        linked_dom = domain_by_name.get(dom_clean) or domain_by_app_id.get(a.id)
        dns_info = dns_cache.get(dom_clean, {"resolved_ip": None, "resolved_ips": []})
        res_ip = dns_info.get("resolved_ip")
        res_ips = dns_info.get("resolved_ips") or []

        matches_srv: Optional[bool] = None
        if a.server_ip and res_ips:
            matches_srv = a.server_ip in res_ips

        has_git = bool(a.current_commit and a.current_commit != "HEAD")
        has_update = bool(
            has_git and a.latest_repo_commit and a.current_commit != a.latest_repo_commit
        )

        app_insights.append({
            "id": a.id,
            "name": a.name,
            "domain": a.domain,
            "domain_id": linked_dom.id if linked_dom else None,
            "server_id": a.server_id,
            "server_name": a.server_name,
            "server_ip": a.server_ip,
            "resolved_ip": res_ip,
            "resolved_ips": res_ips,
            "dns_matches_server": matches_srv,
            "port": a.port,
            "process_manager": "Docker Compose" if a.is_suite else (a.process_manager or "Systemd"),
            "app_type": a.app_type,
            "environment": a.environment,
            "is_suite": a.is_suite,
            "component_count": len(a.components) if a.components else 1,
            "health_status": a.health_status,
            "uptime_percent": a.uptime_percent or 99.98,
            "http_status": a.http_status or 200,
            "ssl_status": linked_dom.ssl_status if linked_dom else (a.ssl_status or "VALID"),
            "ssl_days_remaining": linked_dom.days_remaining if linked_dom else 60,
            "current_commit": a.current_commit if has_git else None,
            "latest_repo_commit": a.latest_repo_commit if has_git else None,
            "git_branch": a.git_branch if has_git else None,
            "root_path": a.root_path,
            "service_name": a.service_name,
            "has_git_update": has_update,
            "is_maintenance": a.is_maintenance,
        })

    # 5. Per-VPS Server Node Fleet Telemetry
    server_nodes: List[Dict[str, Any]] = []
    for s in servers:
        s_apps = [a for a in app_insights if a["server_id"] == s.id]
        s_raw_apps = [a for a in apps if a.server_id == s.id]
        s_doms = [d for d in domain_insights if d["server_id"] == s.id]
        server_nodes.append({
            "id": s.id,
            "name": s.name,
            "public_ip": s.public_ip,
            "status": s.status,
            "os_name": getattr(s, "os_version", None) or getattr(s, "os_name", None) or "Ubuntu 24.04 LTS",
            "cpu_usage": round(getattr(s, "cpu_usage", 0.0) or 0.0, 1),
            "ram_usage": round(getattr(s, "ram_usage", 0.0) or 0.0, 1),
            "disk_usage": round(getattr(s, "disk_usage", 0.0) or 0.0, 1),
            "uptime_days": getattr(s, "uptime_days", 45) or 45,
            "apps_count": len(s_apps),
            "containers_count": len(s_raw_apps),
            "domains_count": len(s_doms),
            "online_apps": sum(1 for a in s_apps if a["health_status"] == "ONLINE"),
            "error_apps": sum(1 for a in s_apps if a["health_status"] in ["OFFLINE", "DEGRADED"]),
            "git_tracked_apps": sum(1 for a in s_apps if a["current_commit"]),
            "dns_mismatch_domains": sum(1 for d in s_doms if d["dns_matches_server"] is False),
            "ssl_warning_domains": sum(1 for d in s_doms if (d["days_remaining"] or 0) <= 30 or d["ssl_status"] in ["NONE", "EXPIRED"]),
        })

    # 6. Licenses Stats
    lic_res = await db.execute(select(License).where(License.deleted_at == None))
    licenses = lic_res.scalars().all()
    lic_total = len(licenses)
    lic_active = sum(1 for l in licenses if l.status == "ACTIVE")
    lic_expiring_soon = sum(
        1 for l in licenses
        if l.status == "ACTIVE" and l.expires_at and (l.expires_at.replace(tzinfo=None) - now).days <= 30
    )
    lic_expired = sum(1 for l in licenses if l.status == "EXPIRED")

    # 7. Deployments Stats (Today)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    dep_res = await db.execute(
        select(Deployment).order_by(Deployment.created_at.desc()).limit(10)
    )
    recent_deployments = dep_res.scalars().all()
    deployments_today = sum(
        1 for d in recent_deployments
        if d.created_at and d.created_at.replace(tzinfo=None) >= today_start
    )
    failed_deployments = sum(1 for d in recent_deployments if d.status == "FAILED")

    # 8. Active Alerts & Recent Incidents & Backups
    alert_res = await db.execute(select(Alert).where(Alert.is_resolved == False).order_by(Alert.created_at.desc()))
    active_alerts = alert_res.scalars().all()

    inc_res = await db.execute(select(Incident).order_by(Incident.started_at.desc()).limit(5))
    incidents = inc_res.scalars().all()

    bkp_res = await db.execute(select(Backup).order_by(Backup.created_at.desc()).limit(10))
    backups = bkp_res.scalars().all()

    return {
        "applications": {
            "total": app_total,
            "total_containers": total_containers,
            "suites_count": suites_count,
            "standalone_count": standalone_count,
            "online": app_online,
            "degraded": app_degraded,
            "offline": app_offline,
            "maintenance": app_maintenance,
            "environments": {
                "production": env_prod,
                "staging": env_stage,
                "development": env_dev,
            },
            "runtimes": {
                "docker": docker_count,
                "apache": apache_count,
                "nginx": nginx_count,
                "other": other_runtime_count,
            },
            "ports": {
                "unique_count": len(active_ports),
                "active_ports": active_ports[:20],
                "collisions": port_collisions,
            },
        },
        "servers": {
            "total": server_total,
            "online": server_online,
            "offline": server_offline,
            "nodes": server_nodes,
        },
        "uptime": {
            "average_uptime": avg_uptime
        },
        "licenses": {
            "total": lic_total,
            "valid": lic_active,
            "expiring_soon": lic_expiring_soon,
            "expired": lic_expired
        },
        "deployments": {
            "today": deployments_today,
            "failed": failed_deployments,
            "recent": [
                {
                    "id": d.id,
                    "application_id": d.application_id,
                    "application_name": app_by_id[d.application_id].name if d.application_id in app_by_id else "Application",
                    "commit_hash": d.commit_hash,
                    "commit_message": d.commit_message,
                    "status": d.status,
                    "deployed_by": d.deployed_by,
                    "created_at": d.created_at.isoformat()
                } for d in recent_deployments[:6]
            ]
        },
        "ssl": {
            "total_domains": len(domains),
            "valid": ssl_valid_count,
            "expiring_soon": ssl_expiring_soon,
            "expired_or_none": ssl_expired_or_none,
            "dns_matching_server": dns_matching_server,
            "dns_mismatch_or_proxy": dns_mismatch_or_proxy,
            "dns_unresolved": dns_unresolved,
        },
        "git": {
            "tracked_count": tracked_git_count,
            "untracked_count": untracked_git_count,
            "pending_updates": pending_updates,
            "up_to_date_count": up_to_date_git_count,
        },
        "backups": {
            "recent_count": len(backups),
            "persistent_storage": True,
        },
        "pending_updates": pending_updates,
        "active_alerts_count": len(active_alerts),
        "active_alerts": [
            {
                "id": a.id,
                "rule_name": a.rule_name,
                "severity": a.severity,
                "source_type": a.source_type,
                "source_name": a.source_name,
                "message": a.message,
                "created_at": a.created_at.isoformat()
            } for a in active_alerts[:5]
        ],
        "incidents": [
            {
                "id": i.id,
                "title": i.title,
                "severity": i.severity,
                "status": i.status,
                "started_at": i.started_at.isoformat(),
                "duration_seconds": i.duration_seconds
            } for i in incidents
        ],
        "app_insights": app_insights,
        "domain_insights": domain_insights,
    }
