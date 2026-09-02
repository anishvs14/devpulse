from __future__ import annotations

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import UserRole
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.comment import Comment
    from app.models.incident import Incident


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.ENGINEER, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    reported_incidents: Mapped[list["Incident"]] = relationship(
        "Incident", foreign_keys="Incident.reporter_id", back_populates="reporter"
    )
    assigned_incidents: Mapped[list["Incident"]] = relationship(
        "Incident", foreign_keys="Incident.assignee_id", back_populates="assignee"
    )
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="author")