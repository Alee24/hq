from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.security import verify_password, hash_password, create_access_token
from backend.app.models.entities import User
from backend.app.schemas.api_schemas import UserLogin, UserRegister, UserResponse, TokenResponse
from backend.app.core.deps import get_current_user
from backend.app.services.audit import log_audit_event
from backend.app.services.email_service import notify_login_event

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    ident = login_data.username_or_email.strip()
    # Find user by username or email (case-insensitive)
    stmt = select(User).where(
        (User.username == ident) | (User.email.ilike(ident)) | (User.username.ilike(ident))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Failsafe: If super admin logs in and user doesn't exist yet or needs sync
    if not user and ident.lower() in [settings.ADMIN_EMAIL.lower(), settings.ADMIN_USERNAME.lower(), "admin"]:
        if verify_password(login_data.password, hash_password(settings.ADMIN_PASSWORD)):
            now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
            user = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                full_name="Alex Metto (Super Admin)",
                role="SUPER_ADMIN",
                is_active=True,
                created_at=now_naive,
                updated_at=now_naive
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is currently suspended. Please contact the administrator."
        )

    # Issue access token
    access_token = create_access_token(data={"sub": user.id, "role": user.role, "username": user.username})

    client_ip = request.client.host if request.client else "127.0.0.1"
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    user_agent = request.headers.get("user-agent", "Web Browser")

    await log_audit_event(
        db=db,
        action="USER_LOGIN",
        entity_type="user",
        username=user.username,
        user_id=user.id,
        ip_address=client_ip,
        details={"login_identifier": login_data.username_or_email, "user_agent": user_agent},
        result="SUCCESS"
    )

    # Trigger async login security alert notification email
    try:
        await notify_login_event(
            username=user.username,
            ip_address=client_ip,
            user_agent=user_agent
        )
    except Exception as e:
        print(f"[LOGIN NOTIFICATION NOTICE]: {e}", flush=True)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    stmt = select(User).where((User.username == user_data.username) | (User.email == user_data.email))
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email or username already exists."
        )

    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await log_audit_event(
        db=db,
        action="USER_REGISTER",
        entity_type="user",
        username=new_user.username,
        user_id=new_user.id,
        details={"role": new_user.role},
        result="SUCCESS"
    )

    return UserResponse.model_validate(new_user)

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
