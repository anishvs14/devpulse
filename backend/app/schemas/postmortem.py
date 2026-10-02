import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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


class PostmortemCreate(BaseModel):
    summary: str = Field(min_length=1)
    impact: str = Field(min_length=1)
    root_cause: str = Field(min_length=1)
    timeline: str = Field(min_length=1)
    resolution: str = Field(min_length=1)
    contributing_factors: str | None = None
    corrective_actions: str | None = None
    lessons_learned: str | None = None


class PostmortemUpdate(BaseModel):
    summary: str | None = Field(default=None, min_length=1)
    impact: str | None = Field(default=None, min_length=1)
    root_cause: str | None = Field(default=None, min_length=1)
    timeline: str | None = Field(default=None, min_length=1)
    resolution: str | None = Field(default=None, min_length=1)
    contributing_factors: str | None = None
    corrective_actions: str | None = None
    lessons_learned: str | None = None
