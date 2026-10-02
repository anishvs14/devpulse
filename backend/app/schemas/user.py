import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """No `role` field on purpose — public registration can never self-elevate
    to ADMIN; every new signup lands as ENGINEER (see auth_service.create_user)."""

    email: EmailStr
    full_name: str
    password: str = Field(min_length=8, max_length=72)


class UserBrief(BaseModel):
    """Public id → name projection for the UI. No email, no timestamps, on purpose."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    role: UserRole
