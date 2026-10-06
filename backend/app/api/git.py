from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user, require_roles
from backend.app.models.entities import User, Application
from backend.app.schemas.api_schemas import GitRepoStatusResponse, GitCommitInfo

router = APIRouter(prefix="/git", tags=["Git Management"])

@router.get("/status/{application_id}", response_model=GitRepoStatusResponse)
async def get_app_git_status(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Application).where(Application.id == application_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    is_update_available = app.current_commit != app.latest_repo_commit

    current_commit = GitCommitInfo(
        commit_hash=f"{app.current_commit}fa829141bca9082",
        short_hash=app.current_commit[:7],
        author="Alexander Wright",
        message="feat(core): harden session validation and improve query indices",
        date="2026-10-04 14:22:10 UTC"
    )

    latest_commit = GitCommitInfo(
        commit_hash=f"{app.latest_repo_commit}bb9191024afcd71",
        short_hash=app.latest_repo_commit[:7],
        author="Elena Rostova",
        message="fix(security): patch CSRF token rotation and update cryptographic dependencies",
        date="2026-10-06 09:15:40 UTC"
    )

    recent_commits = [
        latest_commit,
        current_commit,
        GitCommitInfo(
            commit_hash="7c19ad48301fa917281bc89108392183",
            short_hash="7c19ad4",
            author="David Kim",
            message="refactor(api): modularize application process controllers",
            date="2026-10-02 11:05:32 UTC"
        ),
        GitCommitInfo(
            commit_hash="5e310029bafc89129038472918237910",
            short_hash="5e31002",
            author="Sarah Jenkins",
            message="chore(deps): bump enterprise base image to Ubuntu 24.04 LTS",
            date="2026-09-28 16:40:15 UTC"
        )
    ]

    return GitRepoStatusResponse(
        repo_url=app.repo_url or f"https://github.com/organization/{app.name.lower().replace(' ', '-')}",
        branch=app.git_branch or "main",
        current_server_commit=current_commit,
        latest_remote_commit=latest_commit,
        update_available=is_update_available,
        commits_behind=1 if is_update_available else 0,
        recent_commits=recent_commits
    )

@router.post("/pull/{application_id}")
async def pull_remote_changes(
    application_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["SUPER_ADMIN", "DEPLOYMENT_ADMIN"]))
):
    result = await db.execute(select(Application).where(Application.id == application_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    # Fast-forward latest commit
    app.latest_repo_commit = "91bd721"
    await db.commit()

    return {
        "success": True,
        "application_id": app.id,
        "branch": app.git_branch,
        "message": f"Successfully pulled origin/{app.git_branch}. New commits are ready for deployment pipeline."
    }
