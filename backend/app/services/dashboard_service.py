from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import IncidentStatus
from app.models.incident import Incident

_ACTIVE_STATUSES = [
    IncidentStatus.OPEN,
    IncidentStatus.INVESTIGATING,
    IncidentStatus.IDENTIFIED,
    IncidentStatus.MITIGATING,
]


async def get_active_incidents_count(db: AsyncSession) -> int:
    stmt = select(func.count()).where(Incident.status.in_(_ACTIVE_STATUSES))
    return (await db.execute(stmt)).scalar_one()


async def get_incidents_by_status(db: AsyncSession) -> dict[str, int]:
    stmt = select(Incident.status, func.count()).group_by(Incident.status)
    result = await db.execute(stmt)
    return {status_.value: count for status_, count in result.all()}


async def get_incidents_by_severity(db: AsyncSession) -> dict[str, int]:
    stmt = select(Incident.severity, func.count()).group_by(Incident.severity)
    result = await db.execute(stmt)
    return {severity.value: count for severity, count in result.all()}


async def get_avg_seconds_to_acknowledge(db: AsyncSession) -> float | None:
    # Postgres-specific (extract(epoch from interval)) — same "committed to
    # one database" choice already made for JSONB/native enums elsewhere.
    stmt = select(
        func.avg(func.extract("epoch", Incident.acknowledged_at - Incident.created_at))
    ).where(Incident.acknowledged_at.is_not(None))
    return (await db.execute(stmt)).scalar_one()


async def get_avg_seconds_to_resolve(db: AsyncSession) -> float | None:
    stmt = select(
        func.avg(func.extract("epoch", Incident.resolved_at - Incident.created_at))
    ).where(Incident.resolved_at.is_not(None))
    return (await db.execute(stmt)).scalar_one()