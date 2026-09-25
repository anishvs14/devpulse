import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import IncidentStatus, Priority, Severity, UserRole
from app.schemas.comment import CommentCreate, CommentRead
from app.schemas.incident import (
    IncidentAssign,
    IncidentCreate,
    IncidentRead,
    IncidentStatusUpdate,
    IncidentUpdate,
)
from app.schemas.incident_event import IncidentEventRead
from app.schemas.pagination import Page
from app.services import comment_service, incident_service

router = APIRouter()


async def _get_incident_or_404(db: AsyncSession, incident_id: uuid.UUID):
    incident = await incident_service.get_incident(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return incident


@router.post("/", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
async def create_incident(
    data: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ENGINEER)),
):
    return await incident_service.create_incident(db, data, current_user)


@router.get("/", response_model=Page[IncidentRead])
async def list_incidents(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status_: IncidentStatus | None = Query(None, alias="status"),
    severity: Severity | None = None,
    priority: Priority | None = None,
    service_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    items, total = await incident_service.list_incidents(
        db, page, size, status_, severity, priority, service_id, assignee_id, search
    )
    return Page(items=items, total=total, page=page, size=size)


@router.get("/{incident_id}", response_model=IncidentRead)
async def get_incident(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    return await _get_incident_or_404(db, incident_id)


@router.patch("/{incident_id}", response_model=IncidentRead)
async def update_incident(
    incident_id: uuid.UUID,
    data: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    incident = await _get_incident_or_404(db, incident_id)
    if not incident_service.can_modify(incident, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the reporter, assignee, or an admin can edit this incident",
        )
    return await incident_service.update_incident(db, incident, data)


@router.patch("/{incident_id}/assign", response_model=IncidentRead)
async def assign_incident(
    incident_id: uuid.UUID,
    data: IncidentAssign,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ENGINEER)),
):
    incident = await _get_incident_or_404(db, incident_id)
    return await incident_service.assign_incident(db, incident, data.assignee_id, current_user)


@router.patch("/{incident_id}/status", response_model=IncidentRead)
async def change_incident_status(
    incident_id: uuid.UUID,
    data: IncidentStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ENGINEER)),
):
    incident = await _get_incident_or_404(db, incident_id)
    try:
        return await incident_service.change_status(db, incident, data.status, current_user)
    except incident_service.InvalidTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{incident_id}/timeline", response_model=list[IncidentEventRead])
async def get_incident_timeline(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_incident_or_404(db, incident_id)
    return await incident_service.get_timeline(db, incident_id)


@router.post(
    "/{incident_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED
)
async def add_comment(
    incident_id: uuid.UUID,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_role(UserRole.ADMIN, UserRole.ENGINEER)),
):
    await _get_incident_or_404(db, incident_id)
    return await comment_service.create_comment(db, incident_id, data, current_user)


@router.get("/{incident_id}/comments", response_model=list[CommentRead])
async def list_comments(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await _get_incident_or_404(db, incident_id)
    return await comment_service.list_comments(db, incident_id)


@router.delete("/{incident_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    incident_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    comment = await comment_service.get_comment(db, comment_id)
    if comment is None or comment.incident_id != incident_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if current_user.role != UserRole.ADMIN and comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the comment's author or an admin can delete it",
        )
    await comment_service.delete_comment(db, comment)