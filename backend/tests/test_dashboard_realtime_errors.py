import pytest
from fastapi import WebSocketDisconnect  # noqa: F401  (documents which failure mode is tested)

from app.api.v1.ws import ConnectionManager, _authenticate
from app.core.security import create_access_token
from app.main import app

from .conftest import API, advance


# --------------------------------------------------------------------- dashboard
async def test_dashboard_requires_auth(client):
    assert (await client.get(f"{API}/dashboard/summary")).status_code == 401


async def test_dashboard_empty_state_has_nulls_not_invented_numbers(client, viewer):
    res = await client.get(f"{API}/dashboard/summary", headers=viewer["headers"])
    assert res.status_code == 200
    assert res.json() == {
        "active_incidents": 0,
        "incidents_by_status": {},
        "incidents_by_severity": {},
        "avg_seconds_to_acknowledge": None,
        "avg_seconds_to_resolve": None,
    }


async def test_dashboard_counts_and_timings_from_real_rows(
    client, engineer, viewer, service, incident
):
    h = engineer["headers"]
    # a second incident that is fully resolved
    second = (
        await client.post(
            f"{API}/incidents/",
            headers=h,
            json={
                "title": "t",
                "description": "d",
                "service_id": service["id"],
                "severity": "SEV1",
                "priority": "URGENT",
            },
        )
    ).json()
    await advance(client, h, second["id"], "INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED")

    s = (await client.get(f"{API}/dashboard/summary", headers=viewer["headers"])).json()
    assert s["active_incidents"] == 1  # `incident` is still OPEN; `second` is RESOLVED
    assert s["incidents_by_status"] == {"OPEN": 1, "RESOLVED": 1}
    assert s["incidents_by_severity"] == {"SEV1": 1, "SEV2": 1}
    assert s["avg_seconds_to_acknowledge"] is not None and s["avg_seconds_to_acknowledge"] >= 0
    assert s["avg_seconds_to_resolve"] is not None and s["avg_seconds_to_resolve"] >= 0


async def test_reopened_incident_leaves_resolve_average(client, engineer, viewer, incident):
    h = engineer["headers"]
    await advance(
        client,
        h,
        incident["id"],
        "INVESTIGATING",
        "IDENTIFIED",
        "MITIGATING",
        "RESOLVED",
        "INVESTIGATING",
    )
    s = (await client.get(f"{API}/dashboard/summary", headers=viewer["headers"])).json()
    assert s["avg_seconds_to_resolve"] is None  # resolved_at was cleared on reopen
    assert s["active_incidents"] == 1


# ------------------------------------------------------------ websocket auth logic
async def test_ws_authenticate_accepts_valid_token(engineer):
    user = await _authenticate(engineer["token"])
    assert user is not None and str(user.id) == engineer["id"]


@pytest.mark.parametrize("token", [None, "", "garbage"])
async def test_ws_authenticate_rejects_missing_or_bad_token(token):
    assert await _authenticate(token) is None


async def test_ws_authenticate_rejects_expired_token(engineer):
    expired = create_access_token(subject=engineer["id"], role="ENGINEER", expires_minutes=-1)
    assert await _authenticate(expired) is None


async def test_ws_authenticate_rejects_deactivated_user(engineer):
    from sqlalchemy import text

    from app.db.session import engine

    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET is_active = false"))
    assert await _authenticate(engineer["token"]) is None


class FakeSocket:
    def __init__(self, fail: bool = False):
        self.fail, self.sent = fail, []

    async def send_text(self, message: str):
        if self.fail:
            raise RuntimeError("client went away")
        self.sent.append(message)


async def test_connection_manager_broadcasts_and_drops_dead_sockets():
    m = ConnectionManager()
    good, dead = FakeSocket(), FakeSocket(fail=True)
    m.active.update({good, dead})
    await m.broadcast("hello")
    assert good.sent == ["hello"]
    assert dead not in m.active and good in m.active  # one broken client can't break the rest


# ------------------------------------------------------------------- error handling
async def test_unhandled_exception_returns_plain_500_without_traceback(client):
    from httpx import ASGITransport, AsyncClient

    async def boom():
        raise RuntimeError("secret internal detail")

    app.add_api_route("/__boom", boom)
    try:
        # raise_app_exceptions=False lets the app's own 500 handler answer, like a real server would
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t"
        ) as c:
            res = await c.get("/__boom")
    finally:
        app.router.routes.pop()
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error"}
    assert "secret internal detail" not in res.text


async def test_expected_errors_are_not_swallowed_by_the_500_handler(client, engineer):
    res = await client.get(
        f"{API}/incidents/00000000-0000-0000-0000-000000000000", headers=engineer["headers"]
    )
    assert res.status_code == 404 and res.json()["detail"] == "Incident not found"


async def test_health_endpoints(client):
    assert (await client.get(f"{API}/health")).json()["status"] == "healthy"
    assert (await client.get(f"{API}/health/db")).json()["database"] == "connected"
