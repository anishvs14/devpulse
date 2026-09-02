import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import Severity


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_id: uuid.UUID
    incident_id: uuid.UUID | None
    severity: Severity
    alert_type: str
    message: str
    source: str
    alert_metadata: dict | None
    received_at: datetime
    processed: bool