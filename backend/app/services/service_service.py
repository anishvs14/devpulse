import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ServiceEnvironment, ServiceStatus
from app.models.service import Service
from app.schemas.service import ServiceCreate, ServiceUpdate


async def create_service(db: AsyncSession, data: ServiceCreate) -> Service:
    service = Service(**data.model_dump())
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service


async def get_service(db: AsyncSession, service_id: uuid.UUID) -> Service | None:
    return await db.get(Service, service_id)


async def list_services(
    db: AsyncSession,
    page: int,
    size: int,
    environment: ServiceEnvironment | None = None,
    status: ServiceStatus | None = None,
) -> tuple[list[Service], int]:
    stmt = select(Service)
    if environment is not None:
        stmt = stmt.where(Service.environment == environment)
    if status is not None:
        stmt = stmt.where(Service.status == status)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.order_by(Service.name).offset((page - 1) * size).limit(size)
    items = (await db.execute(stmt)).scalars().all()
    return list(items), total


async def update_service(db: AsyncSession, service: Service, data: ServiceUpdate) -> Service:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    await db.commit()
    await db.refresh(service)
    return service


async def delete_service(db: AsyncSession, service: Service) -> None:
    await db.delete(service)
    await db.commit()