from __future__ import annotations

from sqlalchemy import Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import ServiceEnvironment, ServiceStatus
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.incident import Incident

class Service(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "services"

    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_team: Mapped[str] = mapped_column(String(150), nullable=False)
    environment: Mapped[ServiceEnvironment] = mapped_column(
        Enum(ServiceEnvironment, name="service_environment"), nullable=False
    )
    health_check_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[ServiceStatus] = mapped_column(
        Enum(ServiceStatus, name="service_status"), default=ServiceStatus.UNKNOWN, nullable=False
    )

    incidents: Mapped[list["Incident"]] = relationship("Incident", back_populates="service")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="service")