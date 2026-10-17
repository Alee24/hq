import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import os

from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Application, Server, Deployment, AuditLog, AppLog, ServerTerminalLog
from backend.app.schemas.api_schemas import (
    GitRepoStatusResponse,
    GitCommitInfo,
    GitActionRequest,
    GitActionResponse,
    GitBatchScanResponse,
    ServerDeployKeyResponse,
    AppGitAuthConfigureRequest,
    AppGitAuthConfigureResponse,
    GitWebhookConfigResponse
)
from backend.app.services.remote_executor import (
    detect_remote_application_git,
    scan_all_remote_git_repos,
    execute_remote_git_action,
    build_allowed_names_for_app,
    get_or_create_server_git_deploy_key,
    configure_remote_application_git_auth
)

router = APIRouter(prefix="/git", tags=["Git Management"])


@router.get("/status/{application_id}", response_model=GitRepoStatusResponse)
async def get_app_git_status(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Application).options(selectinload(Application.server)).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    server = app.server
    probe = None
    if server:
        probe = await asyncio.to_thread(detect_remote_application_git, server, app)

    # Sync live Git detection findings to database
    if probe and probe.get("is_git_repo"):
        if probe.get("commit_hash"):
            app.current_commit = probe["commit_hash"]
        if probe.get("branch"):
            app.git_branch = probe["branch"]
        if probe.get("version"):
            app.current_version = probe["version"]
        if probe.get("repo_url"):
            app.repo_url = probe["repo_url"]
        if probe.get("repo_dir"):
            app.root_path = probe["repo_dir"]
        elif probe.get("doc_root"):
            app.root_path = probe["doc_root"]
        if probe.get("update_available") and probe.get("incoming_commits"):
            app.latest_repo_commit = probe["incoming_commits"][0].get("commit_hash", app.current_commit)
        elif probe.get("update_available"):
            app.latest_repo_commit = f"{app.current_commit[:7]}-update" if app.current_commit else "update-pending"
        else:
            app.latest_repo_commit = app.current_commit
        await db.commit()
    elif probe and not probe.get("is_git_repo"):
        if probe.get("doc_root"):
            app.root_path = probe["doc_root"]
        elif probe.get("repo_dir") and not app.root_path:
            app.root_path = probe["repo_dir"]
        app.current_commit = None
        app.latest_repo_commit = None
        app.git_branch = None
        await db.commit()

    # Form recent commits list
    recent_commits: List[GitCommitInfo] = []
    is_git = probe.get("is_git_repo", False) if probe else bool(app.current_commit)

    if is_git:
        if probe and probe.get("recent_commits"):
            for c in probe["recent_commits"]:
                recent_commits.append(GitCommitInfo(
                    commit_hash=c.get("commit_hash", ""),
                    short_hash=c.get("short_hash") or c.get("commit_hash", "")[:7],
                    author=c.get("author", "Git Author"),
                    message=c.get("message", "Commit"),
                    date=str(c.get("date", ""))
                ))
        elif app.current_commit:
            # Fallback to recorded deployments or current app state
            dep_res = await db.execute(
                select(Deployment)
                .where(Deployment.application_id == application_id)
                .order_by(Deployment.created_at.desc())
                .limit(10)
            )
            deployments = dep_res.scalars().all()
            if deployments:
                for d in deployments:
                    recent_commits.append(GitCommitInfo(
                        commit_hash=d.commit_hash or "HEAD",
                        short_hash=(d.commit_hash or "HEAD")[:7],
                        author=d.deployed_by or "System",
                        message=d.commit_message or "Release deployment",
                        date=d.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
                    ))
            else:
                recent_commits.append(GitCommitInfo(
                    commit_hash=app.current_commit,
                    short_hash=app.current_commit[:7],
                    author="System",
                    message=f"Current release {app.current_version or 'v1.0.0'}",
                    date=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                ))

    # Form incoming commits list (capped at latest 5 pending commits)
    incoming_commits: List[GitCommitInfo] = []
    if is_git and probe and probe.get("incoming_commits"):
        for c in probe["incoming_commits"][:5]:
            incoming_commits.append(GitCommitInfo(
                commit_hash=c.get("commit_hash", ""),
                short_hash=c.get("short_hash") or c.get("commit_hash", "")[:7],
                author=c.get("author", "Remote Git Author"),
                message=c.get("message", "Remote update"),
                date=str(c.get("date", ""))
            ))

    if is_git:
        current_server_commit = recent_commits[0] if recent_commits else GitCommitInfo(
            commit_hash=app.current_commit or "HEAD",
            short_hash=(app.current_commit or "HEAD")[:7],
            author="System",
            message="Local Git repository",
            date="N/A"
        )
        latest_remote_commit = incoming_commits[0] if incoming_commits else current_server_commit
        is_update_available = bool(probe.get("update_available") if probe else (app.current_commit and app.current_commit != app.latest_repo_commit))
        commits_behind = int(probe.get("commits_behind", 0) if probe else 0)
    else:
        current_server_commit = GitCommitInfo(
            commit_hash="untracked",
            short_hash="no-git",
            author="N/A",
            message="No Git working tree detected at document root",
            date="N/A"
        )
        latest_remote_commit = current_server_commit
        is_update_available = False
        commits_behind = 0

    return GitRepoStatusResponse(
        repo_url=probe.get("repo_url") if (probe and probe.get("repo_url")) else (app.repo_url or ""),
        branch=probe.get("branch") if (probe and probe.get("branch")) else (app.git_branch or "untracked"),
        repo_dir=probe.get("repo_dir") if probe else (app.root_path or f"/var/www/{app.name.lower()}"),
        doc_root=probe.get("doc_root") if probe else (app.root_path or probe.get("repo_dir") if probe else None),
        version=probe.get("version") if probe else (app.current_version or "v1.0.0"),
        is_git_repo=is_git,
        current_server_commit=current_server_commit,
        latest_remote_commit=latest_remote_commit,
        update_available=is_update_available,
        commits_behind=commits_behind,
        recent_commits=recent_commits,
        incoming_commits=incoming_commits,
        pending_files=probe.get("pending_files", []) if probe else [],
        local_changes=probe.get("local_changes", []) if probe else [],
        total_pending_files=int(probe.get("total_pending_files", 0)) if probe else 0,
        command_outputs=probe.get("command_outputs", {}) if probe else {},
        status_summary=probe.get("status_summary") if probe else ("Working directory clean" if is_git else "No Git working tree detected"),
        server_name=server.name if server else "Remote Host",
        server_ip=server.public_ip if server else "127.0.0.1"
    )


@router.post("/action/{application_id}", response_model=GitActionResponse)
async def execute_git_action_endpoint(
    application_id: str,
    payload: GitActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    result = await db.execute(
        select(Application).options(selectinload(Application.server)).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    server = app.server
    if not server:
        raise HTTPException(status_code=400, detail="Application does not have an assigned server.")

    res = await asyncio.to_thread(
        execute_remote_git_action,
        server=server,
        app=app,
        action=payload.action,
        branch=payload.branch,
        custom_command=payload.custom_command
    )

    if res.get("repo_dir"):
        app.root_path = res["repo_dir"]

    act = payload.action.lower().strip()
    if res.get("success") and act in ["pull", "reset_hard", "pull_deploy", "pull_and_deploy", "deploy_docker"]:
        new_commit = res.get("new_commit")
        new_ver = res.get("new_version")
        if new_commit:
            app.current_commit = new_commit
            app.latest_repo_commit = new_commit
        if new_ver:
            app.current_version = new_ver
        app.last_deployment_at = datetime.now(timezone.utc).replace(tzinfo=None)

        act_label = "PULL & DOCKER DEPLOY" if act in ["pull_deploy", "pull_and_deploy", "deploy_docker"] else act.upper()

        # Record deployment
        dep = Deployment(
            application_id=app.id,
            environment=app.environment or "production",
            branch=payload.branch or app.git_branch or "main",
            commit_hash=new_commit or app.current_commit or "HEAD",
            commit_message=f"Git {act_label}: live origin sync & Docker rebuild on {server.name}",
            commit_author=current_user.username,
            status="SUCCESS",
            deployed_by=current_user.username,
            logs=res.get("stdout") or res.get("message"),
            duration_seconds=max(1, int(res.get("duration_ms", 1000) / 1000))
        )
        db.add(dep)

        # Record audit log
        audit = AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action=f"GIT_{act.upper()}",
            entity_type="application",
            entity_id=app.id,
            details={
                "branch": payload.branch or app.git_branch,
                "new_commit": new_commit,
                "command": res.get("command"),
                "repo_dir": res.get("repo_dir")
            }
        )
        db.add(audit)

    # Record in AppLog for Centralized Logs view
    app_log = AppLog(
        application_id=app.id,
        server_id=server.id,
        severity="INFO" if res.get("success") else "ERROR",
        category="git",
        message=f"Git command executed on {app.name}: {res.get('command') or f'git {payload.action}'} (Exit {res.get('exit_code', 0)})\n{(res.get('stdout') or res.get('stderr') or res.get('message') or '')[:400]}",
        user=current_user.username
    )
    db.add(app_log)

    term_log = ServerTerminalLog(
        server_id=server.id,
        user_id=current_user.id,
        username=current_user.username,
        command=res.get("command", f"git {payload.action}"),
        output=(res.get("stdout") or res.get("stderr") or "")[:4000],
        exit_code=res.get("exit_code", 0),
        execution_duration_ms=res.get("duration_ms", 0)
    )
    db.add(term_log)
    await db.commit()

    return GitActionResponse(**res)


@router.post("/pull/{application_id}")
async def pull_remote_changes(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    result = await db.execute(
        select(Application).options(selectinload(Application.server)).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    server = app.server
    if not server:
        raise HTTPException(status_code=400, detail="Application does not have an assigned server.")

    res = await asyncio.to_thread(
        execute_remote_git_action,
        server=server,
        app=app,
        action="pull",
        branch=app.git_branch
    )

    if res.get("repo_dir"):
        app.root_path = res["repo_dir"]

    if res.get("success"):
        new_commit = res.get("new_commit")
        if new_commit:
            app.current_commit = new_commit
            app.latest_repo_commit = new_commit
        if res.get("new_version"):
            app.current_version = res["new_version"]
        app.last_deployment_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()

    return {
        "success": res.get("success", False),
        "application_id": app.id,
        "branch": app.git_branch,
        "message": res.get("message", f"Pulled origin/{app.git_branch}"),
        "stdout": res.get("stdout", ""),
        "stderr": res.get("stderr", ""),
        "new_commit": res.get("new_commit")
    }


@router.post("/scan-all", response_model=GitBatchScanResponse)
async def scan_all_git_repos_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    servers_res = await db.execute(select(Server).where(Server.is_active == True))
    servers = servers_res.scalars().all()

    total_scanned = 0
    updated_apps = 0
    updates_available_count = 0
    scan_results = []
    subdir_names = {
        "public", "public_html", "html", "dist", "build", "web", "www",
        "current", "release", "releases", "frontend", "backend", "client",
        "server", "api", "app", "src", "out", "static", "httpdocs", "htdocs"
    }

    repos_by_ip: Dict[str, List[Dict[str, Any]]] = {}

    for s in servers:
        if s.public_ip in repos_by_ip:
            discovered_repos = repos_by_ip[s.public_ip]
        else:
            discovered_repos = await asyncio.to_thread(scan_all_remote_git_repos, s)
            repos_by_ip[s.public_ip] = discovered_repos
            total_scanned += len(discovered_repos)

        apps_res = await db.execute(
            select(Application).where(Application.server_id == s.id, Application.deleted_at == None)
        )
        apps = apps_res.scalars().all()

        for a in apps:
            dom_clean = (a.domain or "").lower().strip()
            app_root = (getattr(a, "root_path", None) or "").lower().strip().rstrip("/")
            is_docker = bool(
                (app_root and app_root.startswith("/var/lib/docker"))
                or dom_clean.endswith(".local")
                or (a.process_manager and "docker" in a.process_manager.lower())
                or (a.app_type and "docker" in a.app_type.lower())
            )
            allowed_names = build_allowed_names_for_app(
                a.name, a.domain, getattr(a, "service_name", None), is_docker=is_docker
            )

            app_root_base = os.path.basename(app_root) if app_root else ""
            app_root_parent = os.path.basename(os.path.dirname(app_root)) if app_root else ""
            app_root_belongs_to_app = bool(
                app_root
                and not app_root.startswith("/var/lib/docker")
                and (
                    app_root_base in allowed_names
                    or (app_root_base in subdir_names and app_root_parent in allowed_names)
                )
            )

            matched = None
            for r in discovered_repos:
                r_name = (r.get("name") or "").lower().strip()
                r_dir = (r.get("dir") or "").lower().strip().rstrip("/")
                r_url = (r.get("repo_url") or "").lower().strip().rstrip("/")
                r_url_name = os.path.basename(r_url)[:-4] if r_url.endswith(".git") else os.path.basename(r_url)

                is_exact_path = bool(
                    app_root_belongs_to_app
                    and (
                        app_root == r_dir
                        or (app_root.startswith(r_dir + "/") and app_root_base in subdir_names)
                    )
                )
                is_exact_name_match = bool(
                    r_name in allowed_names
                    or (r_url_name and r_url_name in allowed_names)
                )
                if is_exact_path or is_exact_name_match:
                    matched = r
                    break

            if matched:
                updated_apps += 1
                if matched.get("commit"):
                    a.current_commit = matched["commit"]
                if matched.get("branch"):
                    a.git_branch = matched["branch"]
                if matched.get("version"):
                    a.current_version = matched["version"]
                if matched.get("repo_url"):
                    a.repo_url = matched["repo_url"]
                if matched.get("dir"):
                    a.root_path = matched["dir"]
                if matched.get("update_available"):
                    updates_available_count += 1
                    a.latest_repo_commit = f"{matched['commit'][:7]}-update"
                else:
                    a.latest_repo_commit = a.current_commit

                scan_results.append({
                    "application_id": a.id,
                    "application_name": a.name,
                    "server_name": s.name,
                    "repo_dir": matched.get("dir"),
                    "branch": matched.get("branch"),
                    "commit": matched.get("short_commit"),
                    "version": matched.get("version"),
                    "commits_behind": matched.get("commits_behind", 0),
                    "update_available": matched.get("update_available", False)
                })
            else:
                p = await asyncio.to_thread(detect_remote_application_git, s, a) if discovered_repos else None
                if p and p.get("is_git_repo"):
                    updated_apps += 1
                    if p.get("commit_hash"):
                        a.current_commit = p["commit_hash"]
                    if p.get("branch"):
                        a.git_branch = p["branch"]
                    if p.get("version"):
                        a.current_version = p["version"]
                    if p.get("repo_url"):
                        a.repo_url = p["repo_url"]
                    if p.get("repo_dir"):
                        a.root_path = p["repo_dir"]
                    elif p.get("doc_root"):
                        a.root_path = p["doc_root"]
                    if p.get("update_available"):
                        updates_available_count += 1
                        a.latest_repo_commit = f"{p['commit_hash'][:7]}-update" if p.get("commit_hash") else "update-pending"
                    else:
                        a.latest_repo_commit = a.current_commit

                    scan_results.append({
                        "application_id": a.id,
                        "application_name": a.name,
                        "server_name": s.name,
                        "repo_dir": p.get("repo_dir"),
                        "branch": p.get("branch"),
                        "commit": p.get("short_hash"),
                        "version": p.get("version"),
                        "commits_behind": p.get("commits_behind", 0),
                        "update_available": p.get("update_available", False)
                    })
                else:
                    # Site has no Git repository: clear any previously hijacked or stale commit metadata
                    if p and p.get("doc_root"):
                        a.root_path = p["doc_root"]
                    elif not app_root_belongs_to_app and dom_clean and not dom_clean.endswith(".local"):
                        a.root_path = f"/var/www/{dom_clean}"
                    a.current_commit = None
                    a.latest_repo_commit = None
                    a.git_branch = None
                    a.repo_url = None

    await db.commit()

    return GitBatchScanResponse(
        success=True,
        total_scanned=total_scanned,
        updated_apps=updated_apps,
        updates_available_count=updates_available_count,
        message=f"Scanned {len(servers)} servers. Discovered {total_scanned} git directories, updated {updated_apps} applications ({updates_available_count} updates pending).",
        results=scan_results
    )


@router.get("/deploy-key/{server_id}", response_model=ServerDeployKeyResponse)
async def get_server_deploy_key_endpoint(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    srv_res = await db.execute(select(Server).where(Server.id == server_id))
    server = srv_res.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
        
    res = await asyncio.to_thread(get_or_create_server_git_deploy_key, server, False)
    return ServerDeployKeyResponse(**res)


@router.post("/deploy-key/{server_id}/generate", response_model=ServerDeployKeyResponse)
async def generate_server_deploy_key_endpoint(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    srv_res = await db.execute(select(Server).where(Server.id == server_id))
    server = srv_res.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found.")
        
    res = await asyncio.to_thread(get_or_create_server_git_deploy_key, server, True)
    
    audit = AuditLog(
        user_id=current_user.id,
        username=current_user.username,
        action="GENERATE_GIT_DEPLOY_KEY",
        entity_type="server",
        entity_id=server.id,
        details={"fingerprint": res.get("fingerprint"), "key_type": res.get("key_type")}
    )
    db.add(audit)
    await db.commit()
    
    return ServerDeployKeyResponse(**res)


@router.post("/app/{application_id}/configure-auth", response_model=AppGitAuthConfigureResponse)
async def configure_app_git_auth_endpoint(
    application_id: str,
    payload: AppGitAuthConfigureRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    result = await db.execute(
        select(Application).options(selectinload(Application.server)).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
    if not app.server:
        raise HTTPException(status_code=400, detail="Application does not have an assigned server.")
        
    res = await asyncio.to_thread(
        configure_remote_application_git_auth,
        server=app.server,
        app=app,
        auth_type=payload.auth_type,
        token=payload.token,
        switch_to_ssh=payload.switch_to_ssh,
        custom_repo_url=payload.custom_repo_url
    )
    
    if res.get("success") and res.get("repo_url"):
        app.repo_url = res["repo_url"]
        await db.commit()
        
    return AppGitAuthConfigureResponse(**res)


@router.post("/app/{application_id}/switch-to-ssh", response_model=AppGitAuthConfigureResponse)
async def switch_app_to_ssh_endpoint(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    result = await db.execute(
        select(Application).options(selectinload(Application.server)).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
    if not app.server:
        raise HTTPException(status_code=400, detail="Application does not have an assigned server.")
        
    res = await asyncio.to_thread(
        configure_remote_application_git_auth,
        server=app.server,
        app=app,
        auth_type="SSH",
        token=None,
        switch_to_ssh=True,
        custom_repo_url=None
    )
    
    if res.get("success") and res.get("repo_url"):
        app.repo_url = res["repo_url"]
        await db.commit()
        
    return AppGitAuthConfigureResponse(**res)


@router.get("/webhook/{application_id}/config", response_model=GitWebhookConfigResponse)
async def get_app_webhook_config(
    application_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    base_url = str(request.base_url).rstrip("/")
    webhook_url = f"{base_url}/api/git/webhook/{app.id}"
    
    import hashlib
    secret_seed = f"hq-webhook-{app.id}-{app.server_id or '0'}"
    webhook_secret = hashlib.sha256(secret_seed.encode("utf-8")).hexdigest()[:32]
    
    instructions = {
        "github": "In your GitHub repository, go to Settings > Webhooks > Add webhook. Paste the Payload URL, set Content type to application/json, paste the Secret, and select 'Just the push event'.",
        "gitlab": "In your GitLab project, go to Settings > Webhooks. Paste the URL, Secret token, and check 'Push events'.",
        "bitbucket": "In Bitbucket repository settings, go to Webhooks > Add webhook. Enter URL and select repository push."
    }
    
    return GitWebhookConfigResponse(
        application_id=app.id,
        application_name=app.name,
        webhook_url=webhook_url,
        secret=webhook_secret,
        recommended_events=["push"],
        payload_format="application/json",
        instructions=instructions
    )


@router.post("/webhook/{application_id}")
async def receive_git_webhook(
    application_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_github_event: Optional[str] = Header(None),
    x_gitlab_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
    x_gitlab_token: Optional[str] = Header(None)
):
    """
    Public webhook receiver for GitHub, GitLab, and Bitbucket push events.
    Automatically triggers a clean remote pull and Docker/service update on the assigned VPS.
    """
    result = await db.execute(
        select(Application).options(selectinload(Application.server)).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    server = app.server
    if not server:
        raise HTTPException(status_code=400, detail="Application does not have an assigned server.")
        
    try:
        body = await request.json()
    except Exception:
        body = {}
        
    ref = body.get("ref", "")
    pushed_branch = ref.split("/")[-1] if ref else ""
    commit_hash = body.get("after") or (body.get("commits", [{}])[0].get("id") if body.get("commits") else "HEAD")
    commit_msg = body.get("head_commit", {}).get("message") or (body.get("commits", [{}])[0].get("message") if body.get("commits") else "Automated Webhook Push")
    commit_author = body.get("head_commit", {}).get("author", {}).get("name") or body.get("user_name") or "GitHub Webhook"
    
    res = await asyncio.to_thread(
        execute_remote_git_action,
        server=server,
        app=app,
        action="pull",
        branch=app.git_branch or pushed_branch or "main"
    )
    
    new_commit = res.get("new_commit") or commit_hash
    if res.get("success"):
        app.current_commit = new_commit
        app.latest_repo_commit = new_commit
        if res.get("new_version"):
            app.current_version = res["new_version"]
        app.last_deployment_at = datetime.now(timezone.utc).replace(tzinfo=None)
        
        dep = Deployment(
            application_id=app.id,
            environment=app.environment or "production",
            branch=app.git_branch or pushed_branch or "main",
            commit_hash=new_commit,
            commit_message=f"Webhook Auto-Deploy: {commit_msg[:120]}",
            commit_author=commit_author,
            status="SUCCESS",
            deployed_by=f"Webhook ({commit_author})",
            logs=res.get("stdout") or res.get("message"),
            duration_seconds=max(1, int(res.get("duration_ms", 1000) / 1000))
        )
        db.add(dep)
        await db.commit()
        
    return {
        "success": res.get("success", False),
        "application_id": app.id,
        "application_name": app.name,
        "pushed_branch": pushed_branch,
        "new_commit": new_commit,
        "message": res.get("message", "Webhook processed successfully.")
    }



