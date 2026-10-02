from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserBrief, UserRead

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
) -> list[User]:
    result = await db.execute(select(User))
    return list(result.scalars().all())


@router.get("/directory", response_model=list[UserBrief])
async def user_directory(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[User]:
    """Any signed-in user may resolve user IDs to display names (comment authors,
    assignees, audit-timeline actors). Deliberately exposes id/name/role only."""
    result = await db.execute(select(User).order_by(User.full_name))
    return list(result.scalars().all())
