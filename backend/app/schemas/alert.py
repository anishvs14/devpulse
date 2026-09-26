import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

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


class AlertIngest(BaseModel):
    """What an external monitor posts to /alerts/ingest."""

    service_id: uuid.UUID
    severity: Severity
    alert_type: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1)
    source: str = Field(min_length=1, max_length=100)
    alert_metadata: dict | None = None