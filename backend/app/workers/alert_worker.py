import asyncio
import logging

from app.core.redis import ALERT_QUEUE_KEY, get_redis, publish_event
from app.db.session import AsyncSessionLocal
from app.models.enums import Priority, Severity, ServiceStatus
from app.models.service import Service
from app.services import alert_service, incident_service
from app.services.auth_service import ensure_system_user

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("devpulse.worker")

# Triage policy — deliberately a plain dict, not a config table. Easy to see,
# easy to defend, easy to point at as "the first thing I'd make configurable
# per-service if this went further."
SEVERITY_TO_SERVICE_STATUS = {
    Severity.SEV1: ServiceStatus.DOWN,
    Severity.SEV2: ServiceStatus.DEGRADED,
}
SEVERITY_TO_PRIORITY = {
    Severity.SEV1: Priority.URGENT,
    Severity.SEV2: Priority.HIGH,
}
AUTO_INCIDENT_SEVERITIES = set(SEVERITY_TO_PRIORITY)


async def process_alert(alert_id: str) -> None:
    async with AsyncSessionLocal() as db:
        alert = await alert_service.get_alert(db, alert_id)
        if alert is None:
            logger.warning("Alert %s not found — skipping", alert_id)
            return

        service = await db.get(Service, alert.service_id)
        if service is None:
            logger.warning("Service %s not found for alert %s — skipping", alert.service_id, alert_id)
            return

        new_status = SEVERITY_TO_SERVICE_STATUS.get(alert.severity)
        if new_status is not None and service.status != new_status:
            service.status = new_status
            await db.commit()
            await publish_event(
                "service_status_changed",
                {"service_id": str(service.id), "status": service.status.value},
            )

        incident_id = None
        if alert.severity in AUTO_INCIDENT_SEVERITIES:
            incident = await incident_service.get_open_incident_for_service(db, service.id)
            if incident is None:
                system_user = await ensure_system_user(db)
                priority = SEVERITY_TO_PRIORITY[alert.severity]
                incident = await incident_service.create_incident_from_alert(
                    db, alert, service, priority, system_user
                )
                await publish_event(
                    "incident_created",
                    {
                        "incident_id": str(incident.id),
                        "service_id": str(service.id),
                        "severity": incident.severity.value,
                        "title": incident.title,
                    },
                )
            # Link this alert to whatever incident is now open for the
            # service — whether it's brand new or was already open from an
            # earlier alert. Alert.incident_id is intentionally a plain
            # (non-unique) FK, so many alerts can point at one incident —
            # this is what makes "alert storm → single incident" grouping work.
            alert.incident_id = incident.id
            incident_id = incident.id

        alert.processed = True
        await db.commit()
        await publish_event(
            "alert_processed",
            {
                "alert_id": str(alert.id),
                "service_id": str(service.id),
                "incident_id": str(incident_id) if incident_id else None,
            },
        )


async def run() -> None:
    client = get_redis()
    logger.info("Alert worker started — listening on %s", ALERT_QUEUE_KEY)
    while True:
        # BLPOP blocks until something's queued — no polling loop, no wasted cycles.
        _, alert_id = await client.blpop(ALERT_QUEUE_KEY)
        logger.info("Processing alert %s", alert_id)
        try:
            await process_alert(alert_id)
        except Exception:
            logger.exception("Failed to process alert %s", alert_id)


if __name__ == "__main__":
    asyncio.run(run())