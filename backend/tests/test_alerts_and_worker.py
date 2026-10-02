"""The async alert pipeline: ingest -> Redis queue -> worker -> service health + auto-incident."""

import json

from app.core.redis import ALERT_QUEUE_KEY, REALTIME_CHANNEL, get_redis
from app.workers.alert_worker import process_alert

from .conftest import API, advance

KEY = {"X-API-Key": "test-ingest-key"}


def alert(service_id: str, severity: str = "SEV1", **over):
    return {
        "service_id": service_id,
        "severity": severity,
        "alert_type": "high_cpu",
        "message": "CPU at 98%",
        "source": "prometheus",
        **over,
    }


async def ingest(client, service_id: str, severity: str = "SEV1", **over) -> dict:
    res = await client.post(
        f"{API}/alerts/ingest", headers=KEY, json=alert(service_id, severity, **over)
    )
    assert res.status_code == 202, res.text
    return res.json()


# --------------------------------------------------------------------- ingestion
async def test_ingest_requires_valid_api_key(client, service):
    payload = alert(service["id"])
    assert (
        await client.post(f"{API}/alerts/ingest", json=payload)
    ).status_code == 422  # header missing
    bad = await client.post(f"{API}/alerts/ingest", headers={"X-API-Key": "wrong"}, json=payload)
    assert bad.status_code == 401


async def test_ingest_ignores_jwt_only_api_key_is_accepted(client, service, admin):
    # A logged-in admin's JWT is not a substitute: this route is machine-to-machine.
    res = await client.post(
        f"{API}/alerts/ingest", headers=admin["headers"], json=alert(service["id"])
    )
    assert res.status_code == 422


async def test_ingest_stores_alert_and_enqueues_its_id(client, service):
    body = await ingest(client, service["id"], alert_metadata={"host": "web-1", "cpu": 98})
    assert body["processed"] is False and body["incident_id"] is None
    assert body["alert_metadata"] == {"host": "web-1", "cpu": 98}  # JSONB round-trips

    r = get_redis()
    assert await r.llen(ALERT_QUEUE_KEY) == 1
    assert await r.lpop(ALERT_QUEUE_KEY) == body["id"]


async def test_ingest_validation(client, service):
    bad_sev = await client.post(
        f"{API}/alerts/ingest", headers=KEY, json=alert(service["id"], "SEV0")
    )
    assert bad_sev.status_code == 422
    no_msg = await client.post(
        f"{API}/alerts/ingest", headers=KEY, json=alert(service["id"], message="")
    )
    assert no_msg.status_code == 422


async def test_alert_list_requires_jwt_and_filters(client, service, viewer):
    await ingest(client, service["id"], "SEV1")
    await ingest(client, service["id"], "SEV4")
    assert (await client.get(f"{API}/alerts/")).status_code == 401
    everything = (await client.get(f"{API}/alerts/", headers=viewer["headers"])).json()
    assert everything["total"] == 2
    only_sev4 = (
        await client.get(f"{API}/alerts/", headers=viewer["headers"], params={"severity": "SEV4"})
    ).json()
    assert only_sev4["total"] == 1
    pending = (
        await client.get(f"{API}/alerts/", headers=viewer["headers"], params={"processed": "false"})
    ).json()
    assert pending["total"] == 2


async def test_get_single_alert_and_404(client, service, viewer):
    a = await ingest(client, service["id"])
    assert (
        await client.get(f"{API}/alerts/{a['id']}", headers=viewer["headers"])
    ).status_code == 200
    missing = await client.get(
        f"{API}/alerts/00000000-0000-0000-0000-000000000000", headers=viewer["headers"]
    )
    assert missing.status_code == 404


# ------------------------------------------------------------------------ worker
async def test_sev1_marks_service_down_and_opens_urgent_incident(client, admin, service):
    a = await ingest(client, service["id"], "SEV1")
    await process_alert(a["id"])

    svc = (await client.get(f"{API}/services/{service['id']}", headers=admin["headers"])).json()
    assert svc["status"] == "DOWN"

    incidents = (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()
    assert incidents["total"] == 1
    inc = incidents["items"][0]
    assert inc["severity"] == "SEV1" and inc["priority"] == "URGENT" and inc["status"] == "OPEN"
    assert inc["title"].startswith("[Auto]")

    done = (await client.get(f"{API}/alerts/{a['id']}", headers=admin["headers"])).json()
    assert done["processed"] is True and done["incident_id"] == inc["id"]


async def test_sev2_marks_service_degraded_with_high_priority(client, admin, service):
    a = await ingest(client, service["id"], "SEV2")
    await process_alert(a["id"])
    svc = (await client.get(f"{API}/services/{service['id']}", headers=admin["headers"])).json()
    assert svc["status"] == "DEGRADED"
    inc = (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()["items"][0]
    assert inc["priority"] == "HIGH"


async def test_low_severity_alert_is_processed_without_side_effects(client, admin, service):
    a = await ingest(client, service["id"], "SEV3")
    await process_alert(a["id"])
    svc = (await client.get(f"{API}/services/{service['id']}", headers=admin["headers"])).json()
    assert svc["status"] == "UNKNOWN"  # untouched
    assert (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()["total"] == 0
    done = (await client.get(f"{API}/alerts/{a['id']}", headers=admin["headers"])).json()
    assert done["processed"] is True and done["incident_id"] is None


async def test_alert_storm_groups_onto_one_incident(client, admin, service):
    ids = [
        (await ingest(client, service["id"], "SEV1", message=f"burst {i}"))["id"] for i in range(3)
    ]
    for alert_id in ids:
        await process_alert(alert_id)

    incidents = (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()
    assert incidents["total"] == 1  # three alerts, one incident
    inc_id = incidents["items"][0]["id"]
    for alert_id in ids:
        got = (await client.get(f"{API}/alerts/{alert_id}", headers=admin["headers"])).json()
        assert got["incident_id"] == inc_id  # regression guard for the Section 7d linking bug


async def test_new_incident_opens_after_previous_one_is_resolved(client, admin, service):
    first = await ingest(client, service["id"], "SEV1")
    await process_alert(first["id"])
    inc_id = (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()["items"][0][
        "id"
    ]
    await advance(
        client, admin["headers"], inc_id, "INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED"
    )

    second = await ingest(client, service["id"], "SEV1")
    await process_alert(second["id"])
    assert (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()["total"] == 2


async def test_worker_reuses_single_system_user(client, admin, service, db):
    from sqlalchemy import func, select

    from app.models.user import User

    for _ in range(2):
        await process_alert((await ingest(client, service["id"], "SEV1"))["id"])
    count = (
        await db.execute(select(func.count()).where(User.email == "system@devpulse.internal"))
    ).scalar_one()
    assert count == 1


async def test_auto_incident_timeline_is_marked_as_alert_sourced(client, admin, service):
    await process_alert((await ingest(client, service["id"], "SEV1"))["id"])
    inc_id = (await client.get(f"{API}/incidents/", headers=admin["headers"])).json()["items"][0][
        "id"
    ]
    events = (
        await client.get(f"{API}/incidents/{inc_id}/timeline", headers=admin["headers"])
    ).json()
    assert events[0]["event_type"] == "CREATED" and events[0]["new_value"] == "auto_alert"


async def test_worker_skips_unknown_alert_without_crashing():
    await process_alert("00000000-0000-0000-0000-000000000000")  # logs a warning and returns


async def test_worker_publishes_realtime_events(client, service):
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(REALTIME_CHANNEL)
    await pubsub.get_message(timeout=1)  # subscription confirmation

    a = await ingest(client, service["id"], "SEV1")
    await process_alert(a["id"])

    seen = []
    for _ in range(10):
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
        if msg is None:
            break
        seen.append(json.loads(msg["data"])["type"])
    await pubsub.unsubscribe(REALTIME_CHANNEL)
    await pubsub.aclose()

    assert seen[0] == "alert_ingested"
    assert {"service_status_changed", "incident_created", "alert_processed"} <= set(seen)
