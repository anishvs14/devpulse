import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.models.enums import IncidentEventType
from app.models.incident_event import IncidentEvent
from app.models.user import User
from app.schemas.comment import CommentCreate


async def create_comment(
    db: AsyncSession, incident_id: uuid.UUID, data: CommentCreate, author: User
) -> Comment:
    comment = Comment(incident_id=incident_id, author_id=author.id, body=data.body)
    db.add(comment)
    db.add(
        IncidentEvent(
            incident_id=incident_id,
            actor_id=author.id,
            event_type=IncidentEventType.COMMENT_ADDED,
        )
    )
    await db.commit()
    await db.refresh(comment)
    return comment


async def list_comments(db: AsyncSession, incident_id: uuid.UUID) -> list[Comment]:
    stmt = (
        select(Comment)
        .where(Comment.incident_id == incident_id)
        .order_by(Comment.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_comment(db: AsyncSession, comment_id: uuid.UUID) -> Comment | None:
    return await db.get(Comment, comment_id)


async def delete_comment(db: AsyncSession, comment: Comment) -> None:
    await db.delete(comment)
    await db.commit()