"""Shared test fixtures.

These are integration tests: they run the real FastAPI app against a real
PostgreSQL and a real Redis (service containers in CI, docker compose locally).
Mocking the database would skip exactly the things that break in this project —
native enums, UUID columns, and Postgres-only SQL like extract(epoch ...).

Environment is set BEFORE any `app` import because Settings is read at import time.
"""

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-anywhere-real")
os.environ.setdefault("ALERT_INGEST_API_KEY", "test-ingest-key")
os.environ.setdefault("ENVIRONMENT", "test")  # keeps SQLAlchemy echo off
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://devpulse:devpulse@localhost:5432/devpulse_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")  # DB 15: never touches dev data

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.redis import ALERT_QUEUE_KEY, get_redis  # noqa: E402
from app.db.session import AsyncSessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

API = "/api/v1"
TABLES = "users, services, incidents, incident_events, comments, alerts, postmortems"


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    """Fresh schema once per test session (the migration itself is checked in CI)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean():
    """Empty every table and the alert queue before each test."""
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    await get_redis().delete(ALERT_QUEUE_KEY)
    yield


@pytest.fixture
async def client():
    # ASGITransport does not run the lifespan, so the Redis pub/sub listener
    # task isn't started — tests stay fast and deterministic.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def db():
    async with AsyncSessionLocal() as session:
        yield session


# --------------------------------------------------------------------- helpers
async def make_user(client: AsyncClient, email: str, role: str = "ENGINEER") -> dict:
    """Register through the real endpoint, optionally promote via SQL (registration
    always yields ENGINEER by design), log in, and return {id, headers, ...}."""
    password = "password123"
    res = await client.post(
        f"{API}/auth/register",
        json={"email": email, "full_name": email.split("@")[0], "password": password},
    )
    assert res.status_code == 201, res.text
    user = res.json()
    if role != "ENGINEER":
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE users SET role = CAST(:r AS user_role) WHERE email = :e"),
                {"r": role, "e": email},
            )
    login = await client.post(f"{API}/auth/login", data={"username": email, "password": password})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {
        "id": user["id"],
        "email": email,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest.fixture
async def admin(client):
    return await make_user(client, "admin@example.com", "ADMIN")


@pytest.fixture
async def engineer(client):
    return await make_user(client, "eng@example.com", "ENGINEER")


@pytest.fixture
async def other_engineer(client):
    return await make_user(client, "eng2@example.com", "ENGINEER")


@pytest.fixture
async def viewer(client):
    return await make_user(client, "viewer@example.com", "VIEWER")


@pytest.fixture
async def service(client, admin) -> dict:
    res = await client.post(
        f"{API}/services/",
        headers=admin["headers"],
        json={"name": "payments-api", "owner_team": "payments", "environment": "PRODUCTION"},
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
async def incident(client, engineer, service) -> dict:
    res = await client.post(
        f"{API}/incidents/",
        headers=engineer["headers"],
        json={
            "title": "Checkout returns 502",
            "description": "Users see errors at payment step",
            "service_id": service["id"],
            "severity": "SEV2",
            "priority": "HIGH",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


async def advance(client, headers, incident_id: str, *statuses: str) -> dict:
    """Walk an incident through a series of status changes, asserting each succeeds."""
    last: dict = {}
    for st in statuses:
        res = await client.patch(
            f"{API}/incidents/{incident_id}/status", headers=headers, json={"status": st}
        )
        assert res.status_code == 200, f"{st}: {res.text}"
        last = res.json()
    return last
