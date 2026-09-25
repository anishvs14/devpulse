import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incident_id: uuid.UUID
    author_id: uuid.UUID
    body: str
    created_at: datetime
    updated_at: datetime

class CommentCreate(BaseModel):
    body: str = Field(min_length=1)