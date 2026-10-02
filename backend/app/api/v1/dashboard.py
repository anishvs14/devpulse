from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.db.session import get_db
from app.schemas.dashboard import DashboardSummary
from app.services import dashboard_service

router = APIRouter()


@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Aggregate incident metrics",
    description="Active incident count, status/severity breakdown, and average "
    "time-to-acknowledge/resolve across all incidents. Readable by any authenticated "
    "user, including VIEWER — same visibility as the incidents list.",
)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
) -> DashboardSummary:
    return DashboardSummary(
        active_incidents=await dashboard_service.get_active_incidents_count(db),
        incidents_by_status=await dashboard_service.get_incidents_by_status(db),
        incidents_by_severity=await dashboard_service.get_incidents_by_severity(db),
        avg_seconds_to_acknowledge=await dashboard_service.get_avg_seconds_to_acknowledge(db),
        avg_seconds_to_resolve=await dashboard_service.get_avg_seconds_to_resolve(db),
    )
