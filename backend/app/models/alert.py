from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPKMixin
from app.models.enums import Severity
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.incident import Incident
    from app.models.service import Service

class Alert(UUIDPKMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_service_received", "service_id", "received_at"),)

    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id"), index=True, nullable=False
    )
    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incidents.id"), index=True, nullable=True
    )

    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="severity"), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    alert_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    service: Mapped["Service"] = relationship("Service", back_populates="alerts")
    incident: Mapped["Incident | None"] = relationship("Incident", back_populates="alerts")