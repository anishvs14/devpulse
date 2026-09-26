import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserCreate

SYSTEM_USER_EMAIL = "system@devpulse.internal"


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, user_in: UserCreate) -> User:
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=hash_password(user_in.password),
        role=UserRole.ENGINEER,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user


async def ensure_system_user(db: AsyncSession) -> User:
    """Get-or-create the service account used as reporter/actor for anything
    the alert worker does automatically. Real incident tools (PagerDuty,
    Opsgenie) use the same 'system actor' pattern rather than making
    reporter_id nullable — keeps the schema, and every existing IncidentRead
    consumer, unchanged."""
    user = await get_user_by_email(db, SYSTEM_USER_EMAIL)
    if user is not None:
        return user
    user = User(
        email=SYSTEM_USER_EMAIL,
        full_name="DevPulse System",
        hashed_password=hash_password(uuid.uuid4().hex),  # unused — no login path for this account
        role=UserRole.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user