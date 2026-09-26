import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.enums import Severity
from app.schemas.alert import AlertIngest


async def create_alert(db: AsyncSession, data: AlertIngest) -> Alert:
    alert = Alert(**data.model_dump())
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


async def get_alert(db: AsyncSession, alert_id: uuid.UUID | str) -> Alert | None:
    if isinstance(alert_id, str):
        alert_id = uuid.UUID(alert_id)
    return await db.get(Alert, alert_id)


async def list_alerts(
    db: AsyncSession,
    page: int,
    size: int,
    service_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    processed: bool | None = None,
) -> tuple[list[Alert], int]:
    stmt = select(Alert)
    if service_id is not None:
        stmt = stmt.where(Alert.service_id == service_id)
    if severity is not None:
        stmt = stmt.where(Alert.severity == severity)
    if processed is not None:
        stmt = stmt.where(Alert.processed == processed)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Alert.received_at.desc()).offset((page - 1) * size).limit(size)
    items = (await db.execute(stmt)).scalars().all()
    return list(items), total