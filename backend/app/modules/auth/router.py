from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.responses import ok
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_email_code,
    hash_password,
    hash_secret,
    verify_password,
)
from app.db.models import EmailVerificationCode, RefreshToken, User
from app.db.session import get_db_session
from app.modules.auth.schemas import (
    AuthSession,
    AuthUser,
    EmailCodeRequest,
    EmailCodeResponse,
    LoginRequest,
    LogoutRequest,
    LogoutResponse,
    RefreshRequest,
    RegisterRequest,
)
from app.modules.email import send_verification_code

router = APIRouter(prefix="/auth")
authorization_header = Header(default=None)
db_session_dependency = Depends(get_db_session)


def serialize_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        name=user.name,
        email=user.email,
        emailVerified=user.email_verified,
    )


async def create_session_response(user: User, session: AsyncSession) -> AuthSession:
    settings = get_settings()
    raw_refresh_token = create_refresh_token()
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_secret(raw_refresh_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    session.add(refresh_token)
    await session.commit()

    return AuthSession(
        user=serialize_user(user),
        accessToken=create_access_token(user.id),
        refreshToken=raw_refresh_token,
        expiresIn=settings.access_token_minutes * 60,
    )


async def get_current_user(
    authorization: str | None = authorization_header,
    session: AsyncSession = db_session_dependency,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    settings = get_settings()
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    if payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await session.get(User, payload["sub"])
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


current_user_dependency = Depends(get_current_user)


@router.post("/email-code")
async def request_email_code(
    body: EmailCodeRequest,
    session: AsyncSession = db_session_dependency,
):
    settings = get_settings()
    now = datetime.now(UTC)
    email = body.email.lower()
    cooldown_start = now - timedelta(seconds=settings.email_code_cooldown_seconds)
    recent_result = await session.execute(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == body.purpose,
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.created_at >= cooldown_start,
        )
        .order_by(EmailVerificationCode.created_at.desc())
    )
    if recent_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Code cooldown active",
        )

    code = generate_email_code()
    verification = EmailVerificationCode(
        email=email,
        purpose=body.purpose,
        code_hash=hash_secret(code),
        expires_at=now + timedelta(minutes=settings.email_code_expire_minutes),
    )
    session.add(verification)
    await session.commit()

    sent = send_verification_code(email, code, settings)
    debug_code = code if settings.env in {"local", "test"} and not sent else None
    return ok(
        EmailCodeResponse(
            sent=sent,
            cooldownSeconds=settings.email_code_cooldown_seconds,
            debugCode=debug_code,
        )
    )


async def consume_email_code(email: str, purpose: str, code: str, session: AsyncSession) -> None:
    now = datetime.now(UTC)
    result = await session.execute(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.expires_at >= now,
        )
        .order_by(EmailVerificationCode.created_at.desc())
    )
    verification = result.scalars().first()
    if not verification or verification.code_hash != hash_secret(code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email code")

    verification.consumed_at = now


@router.post("/register")
async def register(body: RegisterRequest, session: AsyncSession = db_session_dependency):
    email = body.email.lower()
    existing_result = await session.execute(select(User).where(User.email == email))
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    await consume_email_code(email, "register", body.code, session)
    user = User(
        email=email,
        name=body.name.strip(),
        password_hash=hash_password(body.password),
        email_verified=True,
    )
    session.add(user)
    await session.flush()
    auth_session = await create_session_response(user, session)
    return ok(auth_session)


@router.post("/login")
async def login(body: LoginRequest, session: AsyncSession = db_session_dependency):
    identifier = body.identifier.strip()
    result = await session.execute(
        select(User).where(or_(User.email == identifier.lower(), User.name == identifier))
    )
    user = result.scalars().first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return ok(await create_session_response(user, session))


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: AsyncSession = db_session_dependency):
    token_hash = hash_secret(body.refreshToken)
    now = datetime.now(UTC)
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at >= now,
        )
    )
    refresh_token = result.scalar_one_or_none()
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = await session.get(User, refresh_token.user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    refresh_token.revoked_at = now
    return ok(await create_session_response(user, session))


@router.post("/logout")
async def logout(body: LogoutRequest, session: AsyncSession = db_session_dependency):
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_secret(body.refreshToken))
    )
    refresh_token = result.scalar_one_or_none()
    if refresh_token:
        refresh_token.revoked_at = datetime.now(UTC)
        await session.commit()

    return ok(LogoutResponse(loggedOut=True))


@router.get("/me")
async def me(current_user: User = current_user_dependency):
    return ok(serialize_user(current_user))
