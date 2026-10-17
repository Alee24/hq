from typing import Generator, Optional, List
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.core.security import decode_access_token
from backend.app.models.entities import User, ApiKey
import hashlib

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

async def get_current_user_optional(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    # Check API Key header first
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        key_hash = hashlib.sha256(api_key_header.encode()).hexdigest()
        result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True))
        api_key = result.scalar_one_or_none()
        if api_key:
            # Synthetic user representing this API Key
            return User(
                id=f"apikey-{api_key.id}",
                username=f"apikey:{api_key.name}",
                email=f"{api_key.name}@api.system",
                role=api_key.role,
                is_active=True
            )

    if not token:
        # Check authorization header manually if OAuth2PasswordBearer missed it
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        # Check query parameters (for direct browser file downloads)
        token = request.query_params.get("token")

    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        return None

    sub = payload.get("sub")
    username = payload.get("username")
    user_id = payload.get("user_id") or sub
    if not sub and not username and not user_id:
        return None

    # Resilient resolution: Find user by ID, username, or email
    stmt = select(User).where(
        ((User.id == user_id) | (User.id == sub) | (User.username == username) | (User.username == sub) | (User.email == user_id) | (User.email == sub)) & (User.is_active == True)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Failsafe for Super Admin across database rebuilds / reseeds:
    # If the token was signed with the valid SECRET_KEY and belongs to the admin, resolve to the active Super Admin
    if not user and (
        username in [settings.ADMIN_USERNAME, "mettoalex", "admin"] or 
        user_id in [settings.ADMIN_USERNAME, settings.ADMIN_EMAIL, "mettoalex", "admin"]
    ):
        super_res = await db.execute(select(User).where(User.role == "SUPER_ADMIN", User.is_active == True))
        user = super_res.scalar_one_or_none()

    return user

async def get_current_user(
    current_user: Optional[User] = Depends(get_current_user_optional)
) -> User:
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided or have expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

def require_roles(allowed_roles: List[str]):
    """
    Enforces Role-Based Access Control (RBAC).
    SUPER_ADMIN always has full access.
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == "SUPER_ADMIN":
            return current_user
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}. Your role: {current_user.role}"
            )
        return current_user
    return role_checker
