from pydantic import BaseModel


class DashboardSummary(BaseModel):
    active_incidents: int
    incidents_by_status: dict[str, int]
    incidents_by_severity: dict[str, int]
    avg_seconds_to_acknowledge: float | None
    avg_seconds_to_resolve: float | None
