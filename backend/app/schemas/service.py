import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

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