import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PostmortemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incident_id: uuid.UUID
    author_id: uuid.UUID
    summary: str
    impact: str
    root_cause: str
    timeline: str
    resolution: str
    contributing_factors: str | None
    corrective_actions: str | None
    lessons_learned: str | None
    created_at: datetime
    updated_at: datetime