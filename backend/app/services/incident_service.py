import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import IncidentEventType, IncidentStatus, Priority, Severity, UserRole
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.user import User
from app.schemas.incident import IncidentCreate, IncidentUpdate
from app.models.alert import Alert
from app.models.service import Service

VALID_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.OPEN: {IncidentStatus.INVESTIGATING},
    IncidentStatus.INVESTIGATING: {IncidentStatus.IDENTIFIED},
    IncidentStatus.IDENTIFIED: {IncidentStatus.MITIGATING},
    IncidentStatus.MITIGATING: {IncidentStatus.RESOLVED},
    IncidentStatus.RESOLVED: {IncidentStatus.CLOSED, IncidentStatus.INVESTIGATING},  # reopen if premature
    IncidentStatus.CLOSED: set(),  # terminal — file a new incident instead
}


class InvalidTransitionError(Exception):
    def __init__(self, current: IncidentStatus, attempted: IncidentStatus):
        self.current = current
        self.attempted = attempted
        super().__init__(f"Cannot transition from {current.value} to {attempted.value}")


def can_modify(incident: Incident, user: User) -> bool:
    """Ownership check: reporter, assignee, or admin. Used for general field edits only —
    status changes and assignment intentionally use role checks instead (see Module notes)."""
    return user.role == UserRole.ADMIN or user.id in (incident.reporter_id, incident.assignee_id)


async def create_incident(db: AsyncSession, data: IncidentCreate, reporter: User) -> Incident:
    incident = Incident(
        title=data.title,
        description=data.description,
        service_id=data.service_id,
        reporter_id=reporter.id,
        severity=data.severity,
        priority=data.priority,
    )
    db.add(incident)
    await db.flush()  # populate incident.id before the event row references it

    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=reporter.id,
            event_type=IncidentEventType.CREATED,
        )
    )
    await db.commit()
    await db.refresh(incident)
    return incident


async def get_incident(db: AsyncSession, incident_id: uuid.UUID) -> Incident | None:
    return await db.get(Incident, incident_id)


async def list_incidents(
    db: AsyncSession,
    page: int,
    size: int,
    status: IncidentStatus | None = None,
    severity: Severity | None = None,
    priority: Priority | None = None,
    service_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    search: str | None = None,
) -> tuple[list[Incident], int]:
    stmt = select(Incident)
    if status is not None:
        stmt = stmt.where(Incident.status == status)
    if severity is not None:
        stmt = stmt.where(Incident.severity == severity)
    if priority is not None:
        stmt = stmt.where(Incident.priority == priority)
    if service_id is not None:
        stmt = stmt.where(Incident.service_id == service_id)
    if assignee_id is not None:
        stmt = stmt.where(Incident.assignee_id == assignee_id)
    if search:
        stmt = stmt.where(Incident.title.ilike(f"%{search}%"))

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Incident.created_at.desc()).offset((page - 1) * size).limit(size)
    items = (await db.execute(stmt)).scalars().all()
    return list(items), total


async def update_incident(db: AsyncSession, incident: Incident, data: IncidentUpdate) -> Incident:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(incident, field, value)
    await db.commit()
    await db.refresh(incident)
    return incident


async def assign_incident(
    db: AsyncSession, incident: Incident, assignee_id: uuid.UUID | None, actor: User
) -> Incident:
    old_value = str(incident.assignee_id) if incident.assignee_id else None
    incident.assignee_id = assignee_id

    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=actor.id,
            event_type=IncidentEventType.ASSIGNMENT_CHANGE,
            field_name="assignee_id",
            old_value=old_value,
            new_value=str(assignee_id) if assignee_id else None,
        )
    )
    await db.commit()
    await db.refresh(incident)
    return incident


async def change_status(
    db: AsyncSession, incident: Incident, new_status: IncidentStatus, actor: User
) -> Incident:
    if new_status not in VALID_TRANSITIONS[incident.status]:
        raise InvalidTransitionError(incident.status, new_status)

    old_status = incident.status
    incident.status = new_status

    if old_status == IncidentStatus.OPEN and new_status == IncidentStatus.INVESTIGATING:
        incident.acknowledged_at = datetime.now(timezone.utc)
    if new_status == IncidentStatus.RESOLVED:
        incident.resolved_at = datetime.now(timezone.utc)
    if new_status == IncidentStatus.INVESTIGATING and old_status == IncidentStatus.RESOLVED:
        incident.resolved_at = None  # reopened — no longer resolved

    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=actor.id,
            event_type=IncidentEventType.STATUS_CHANGE,
            field_name="status",
            old_value=old_status.value,
            new_value=new_status.value,
        )
    )
    await db.commit()
    await db.refresh(incident)
    return incident


async def get_timeline(db: AsyncSession, incident_id: uuid.UUID) -> list[IncidentEvent]:
    stmt = (
        select(IncidentEvent)
        .where(IncidentEvent.incident_id == incident_id)
        .order_by(IncidentEvent.created_at.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())

async def get_open_incident_for_service(db: AsyncSession, service_id: uuid.UUID) -> Incident | None:
    stmt = select(Incident).where(
        Incident.service_id == service_id,
        Incident.status.notin_([IncidentStatus.RESOLVED, IncidentStatus.CLOSED]),
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def create_incident_from_alert(
    db: AsyncSession, alert: Alert, service: Service, priority: Priority, system_user: User
) -> Incident:
    incident = Incident(
        title=f"[Auto] {alert.alert_type} on {service.name}",
        description=f"Automatically opened from a {alert.severity.value} alert: {alert.message}",
        service_id=service.id,
        reporter_id=system_user.id,
        severity=alert.severity,
        priority=priority,
    )
    db.add(incident)
    await db.flush()

    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=system_user.id,
            event_type=IncidentEventType.CREATED,
            field_name="source",
            new_value="auto_alert",
        )
    )
    await db.commit()
    await db.refresh(incident)
    return incident