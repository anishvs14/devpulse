# backend/app/schemas/incident.py
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import IncidentStatus, Priority, Severity


class IncidentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    service_id: uuid.UUID
    reporter_id: uuid.UUID
    assignee_id: uuid.UUID | None
    severity: Severity
    priority: Priority
    status: IncidentStatus
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class IncidentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    service_id: uuid.UUID
    severity: Severity
    priority: Priority


class IncidentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    severity: Severity | None = None
    priority: Priority | None = None


class IncidentAssign(BaseModel):
    assignee_id: uuid.UUID | None = None


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus