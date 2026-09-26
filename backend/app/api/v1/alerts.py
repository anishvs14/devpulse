import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, verify_ingest_api_key
from app.core.redis import ALERT_QUEUE_KEY, get_redis, publish_event
from app.db.session import get_db
from app.models.enums import Severity
from app.schemas.alert import AlertIngest, AlertRead
from app.schemas.pagination import Page
from app.services import alert_service

router = APIRouter()


@router.post("/ingest", response_model=AlertRead, status_code=status.HTTP_202_ACCEPTED)
async def ingest_alert(
    data: AlertIngest,
    db: AsyncSession = Depends(get_db),
    _ok: None = Depends(verify_ingest_api_key),
):
    # Write first (durability — the raw alert survives even if Redis restarts),
    # then hand the heavy lifting off to the worker so ingestion stays fast
    # under a burst of alerts.
    alert = await alert_service.create_alert(db, data)
    client = get_redis()
    await client.rpush(ALERT_QUEUE_KEY, str(alert.id))
    await publish_event(
        "alert_ingested",
        {
            "alert_id": str(alert.id),
            "service_id": str(alert.service_id),
            "severity": alert.severity.value,
            "alert_type": alert.alert_type,
        },
    )
    return alert


@router.get("/", response_model=Page[AlertRead])
async def list_alerts(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    service_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    processed: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    items, total = await alert_service.list_alerts(db, page, size, service_id, severity, processed)
    return Page(items=items, total=total, page=page, size=size)


@router.get("/{alert_id}", response_model=AlertRead)
async def get_alert(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    alert = await alert_service.get_alert(db, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert