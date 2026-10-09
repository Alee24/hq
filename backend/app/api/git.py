from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Application, Server, Deployment, AuditLog
from backend.app.schemas.api_schemas import (
    GitRepoStatusResponse,
    GitCommitInfo,
    GitActionRequest,
    GitActionResponse,
    GitBatchScanResponse
)
from backend.app.services.remote_executor import (
    detect_remote_application_git,
    scan_all_remote_git_repos,
    execute_remote_git_action
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
        probe = detect_remote_application_git(server, app)

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
        if probe.get("doc_root"):
            app.root_path = probe["doc_root"]
        elif probe.get("repo_dir") and not app.root_path:
            app.root_path = probe["repo_dir"]
        if probe.get("incoming_commits"):
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

    # Form incoming commits list
    incoming_commits: List[GitCommitInfo] = []
    if is_git and probe and probe.get("incoming_commits"):
        for c in probe["incoming_commits"]:
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

    res = execute_remote_git_action(
        server=server,
        app=app,
        action=payload.action,
        branch=payload.branch,
        custom_command=payload.custom_command
    )

    act = payload.action.lower().strip()
    if res.get("success") and act in ["pull", "reset_hard"]:
        new_commit = res.get("new_commit")
        new_ver = res.get("new_version")
        if new_commit:
            app.current_commit = new_commit
            app.latest_repo_commit = new_commit
        if new_ver:
            app.current_version = new_ver
        app.last_deployment_at = datetime.now(timezone.utc).replace(tzinfo=None)

        # Record deployment
        dep = Deployment(
            application_id=app.id,
            environment=app.environment or "production",
            branch=payload.branch or app.git_branch or "main",
            commit_hash=new_commit or app.current_commit or "HEAD",
            commit_message=f"Git {act.upper()}: live origin sync on {server.name}",
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
                "command": res.get("command")
            }
        )
        db.add(audit)
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

    res = execute_remote_git_action(
        server=server,
        app=app,
        action="pull",
        branch=app.git_branch
    )

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

    for s in servers:
        discovered_repos = scan_all_remote_git_repos(s)
        total_scanned += len(discovered_repos)

        apps_res = await db.execute(
            select(Application).where(Application.server_id == s.id, Application.deleted_at == None)
        )
        apps = apps_res.scalars().all()

        for a in apps:
            app_clean = (a.name or "").lower().strip()
            dom_clean = (a.domain or "").lower().strip()
            app_root = (getattr(a, "root_path", None) or "").lower().strip()

            matched = None
            for r in discovered_repos:
                r_name = r.get("name", "").lower()
                r_dir = r.get("dir", "").lower()
                if (app_root and (app_root == r_dir or app_root.startswith(r_dir) or r_dir.startswith(app_root))) or \
                   r_name == app_clean or r_name in app_clean or app_clean in r_name or dom_clean in r_dir:
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
                if matched.get("dir") and not a.root_path:
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
            elif discovered_repos and a.root_path:
                p = detect_remote_application_git(s, a)
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
                    if p.get("doc_root"):
                        a.root_path = p["doc_root"]
                    elif p.get("repo_dir") and not a.root_path:
                        a.root_path = p["repo_dir"]
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
                elif p and not p.get("is_git_repo"):
                    if p.get("doc_root"):
                        a.root_path = p["doc_root"]
                    elif p.get("repo_dir") and not a.root_path:
                        a.root_path = p["repo_dir"]

    await db.commit()

    return GitBatchScanResponse(
        success=True,
        total_scanned=total_scanned,
        updated_apps=updated_apps,
        updates_available_count=updates_available_count,
        message=f"Scanned {len(servers)} servers. Discovered {total_scanned} git directories, updated {updated_apps} applications ({updates_available_count} updates pending).",
        results=scan_results
    )

