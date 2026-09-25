import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


from app.models.enums import ServiceEnvironment, ServiceStatus


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    owner_team: str
    environment: ServiceEnvironment
    health_check_url: str | None
    status: ServiceStatus
    created_at: datetime
    updated_at: datetime

class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    owner_team: str = Field(min_length=1, max_length=150)
    environment: ServiceEnvironment
    health_check_url: str | None = None


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    owner_team: str | None = Field(default=None, min_length=1, max_length=150)
    environment: ServiceEnvironment | None = None
    health_check_url: str | None = None
    status: ServiceStatus | None = None