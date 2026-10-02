import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.postmortem import Postmortem
from app.schemas.postmortem import PostmortemCreate, PostmortemUpdate


async def get_postmortem_by_incident(db: AsyncSession, incident_id: uuid.UUID) -> Postmortem | None:
    # Postmortem's PK is its own id, not incident_id (incident_id is just a
    # unique FK) — so this has to be a filtered select, not db.get().
    result = await db.execute(select(Postmortem).where(Postmortem.incident_id == incident_id))
    return result.scalar_one_or_none()


async def create_postmortem(
    db: AsyncSession, incident_id: uuid.UUID, data: PostmortemCreate, author_id: uuid.UUID
) -> Postmortem:
    postmortem = Postmortem(incident_id=incident_id, author_id=author_id, **data.model_dump())
    db.add(postmortem)
    await db.commit()
    await db.refresh(postmortem)
    return postmortem


async def update_postmortem(
    db: AsyncSession, postmortem: Postmortem, data: PostmortemUpdate
) -> Postmortem:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(postmortem, field, value)
    await db.commit()
    await db.refresh(postmortem)
    return postmortem
