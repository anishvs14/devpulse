import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import IncidentEventType


class IncidentEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incident_id: uuid.UUID
    actor_id: uuid.UUID | None
    event_type: IncidentEventType
    field_name: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime