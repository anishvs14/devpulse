"""Fill a running DevPulse with realistic demo data, using the PUBLIC API.

Why through the API instead of inserting rows: it exercises the same validation,
audit-trail and alert-pipeline code a real user would, so the demo data is
guaranteed to be something the app can actually produce.

    cd backend
    uv run python scripts/seed.py                     # against http://localhost:8000
    uv run python scripts/seed.py --base https://your.domain/api/v1

Run the alert worker too (`uv run python -m app.workers.alert_worker`), otherwise
the SEV1/SEV2 alerts below will sit in the queue instead of opening incidents.

NEVER run this against a real production database: it creates accounts with a
publicly documented password.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx
from sqlalchemy import text

# `python scripts/seed.py` puts scripts/ on sys.path, not the backend root, so add it for `import app`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

PASSWORD = "demo-password-123"
USERS = [
    ("admin@example.com", "Asha Admin", "ADMIN"),
    ("engineer@example.com", "Rohan Engineer", "ENGINEER"),
    ("oncall@example.com", "Meera On-call", "ENGINEER"),
    ("viewer@example.com", "Vik Viewer", "VIEWER"),
]
SERVICES = [
    ("payments-api", "payments", "PRODUCTION", "Card and UPI payment processing"),
    ("auth-service", "platform", "PRODUCTION", "Login, tokens and sessions"),
    ("search-indexer", "discovery", "PRODUCTION", "Builds the product search index"),
    ("notifications", "growth", "STAGING", "Email and push delivery"),
    ("inventory-service", "commerce", "PRODUCTION", "Stock levels and reservations"),
]
WALK = ["INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED"]


async def promote(emails_roles: list[tuple[str, str]]) -> None:
    """Registration always creates ENGINEERs (by design), so elevated demo roles need SQL."""
    from app.db.session import engine

    async with engine.begin() as conn:
        for email, role in emails_roles:
            await conn.execute(
                text("UPDATE users SET role = CAST(:r AS user_role) WHERE email = :e"),
                {"r": role, "e": email},
            )
    await engine.dispose()


async def login(c: httpx.AsyncClient, email: str) -> dict[str, str]:
    r = await c.post("/auth/login", data={"username": email, "password": PASSWORD})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def main(base: str, api_key: str) -> int:
    async with httpx.AsyncClient(base_url=base, timeout=15) as c:
        for email, name, _ in USERS:
            r = await c.post(
                "/auth/register", json={"email": email, "full_name": name, "password": PASSWORD}
            )
            if r.status_code not in (201, 400):  # 400 = already registered, which is fine
                print("register failed:", r.status_code, r.text)
                return 1
        await promote([(e, role) for e, _, role in USERS if role != "ENGINEER"])

        admin = await login(c, "admin@example.com")
        if (await c.get("/incidents/", headers=admin, params={"size": 1})).json()["total"] > 0:
            print("Incidents already exist, so this looks seeded already. Nothing to do.")
            return 0
        eng = await login(c, "engineer@example.com")
        oncall = await login(c, "oncall@example.com")
        users = {
            u["full_name"]: u["id"] for u in (await c.get("/users/directory", headers=admin)).json()
        }

        existing = {
            s["name"]: s
            for s in (await c.get("/services/", headers=admin, params={"size": 100})).json()[
                "items"
            ]
        }
        svc: dict[str, dict] = {}
        for name, team, env, desc in SERVICES:
            if name in existing:
                svc[name] = existing[name]
                continue
            r = await c.post(
                "/services/",
                headers=admin,
                json={
                    "name": name,
                    "owner_team": team,
                    "environment": env,
                    "description": desc,
                    "health_check_url": f"https://{name}.internal/health",
                },
            )
            r.raise_for_status()
            svc[name] = r.json()

        async def incident(headers, title, desc, service, sev, pri, steps=0, assignee=None):
            r = await c.post(
                "/incidents/",
                headers=headers,
                json={
                    "title": title,
                    "description": desc,
                    "service_id": svc[service]["id"],
                    "severity": sev,
                    "priority": pri,
                },
            )
            r.raise_for_status()
            inc = r.json()
            if assignee:
                await c.patch(
                    f"/incidents/{inc['id']}/assign",
                    headers=headers,
                    json={"assignee_id": users[assignee]},
                )
            for st in WALK[:steps]:
                (
                    await c.patch(
                        f"/incidents/{inc['id']}/status", headers=headers, json={"status": st}
                    )
                ).raise_for_status()
            return inc

        # A few incidents at different stages so every dashboard chart has something to show.
        await incident(
            eng,
            "Checkout latency above 4s",
            "p99 on /pay climbing since the 14:05 deploy.",
            "payments-api",
            "SEV2",
            "HIGH",
            steps=2,
            assignee="Meera On-call",
        )
        await incident(
            eng,
            "Intermittent 401s after token refresh",
            "Some users are logged out every few minutes.",
            "auth-service",
            "SEV3",
            "MEDIUM",
            steps=1,
            assignee="Rohan Engineer",
        )
        await incident(
            oncall,
            "Search results stale for new listings",
            "Indexer queue backing up.",
            "search-indexer",
            "SEV3",
            "LOW",
            steps=0,
        )
        done = await incident(
            eng,
            "Push notifications not delivered",
            "FCM credentials expired in staging.",
            "notifications",
            "SEV4",
            "LOW",
            steps=4,
            assignee="Rohan Engineer",
        )
        (
            await c.post(
                f"/incidents/{done['id']}/comments",
                headers=eng,
                json={"body": "Rotated the FCM key and redeployed. Watching delivery rate."},
            )
        ).raise_for_status()
        (
            await c.post(
                f"/incidents/{done['id']}/comments",
                headers=oncall,
                json={"body": "Delivery back to 99.8%. Good to close."},
            )
        ).raise_for_status()
        (
            await c.post(
                f"/incidents/{done['id']}/postmortem",
                headers=eng,
                json={
                    "summary": "Staging push notifications failed for about six hours.",
                    "impact": "No customer impact; internal QA was blocked on notification testing.",
                    "root_cause": "The FCM service-account key expired and nothing alerted on it.",
                    "timeline": "09:10 QA reports missing pushes. 09:40 cause found. 10:05 key rotated. 10:20 verified.",
                    "resolution": "Rotated the key and redeployed the notifications service.",
                    "corrective_actions": "Add a 14-day expiry warning for all third-party credentials.",
                    "lessons_learned": "Credentials with expiry dates need an owner and a calendar entry.",
                },
            )
        ).raise_for_status()

        # Alerts go through the real pipeline: queue -> worker -> service health + auto-incident.
        # The SEV1 pair targets inventory-service, which has NO open incident, so the worker opens
        # one automatically and the second alert groups onto it (alert-storm handling). The SEV2
        # alert lands on payments-api, which already has an open incident, so it attaches there.
        key = {"X-API-Key": api_key}
        alerts = [
            ("inventory-service", "SEV1", "error_rate", "5xx responses at 38% over 5 minutes"),
            ("inventory-service", "SEV1", "error_rate", "5xx responses still at 41%"),
            ("payments-api", "SEV2", "p99_latency", "p99 latency 4.2s (threshold 1.5s)"),
            ("search-indexer", "SEV3", "queue_depth", "Index queue at 12k items"),
            ("notifications", "SEV4", "disk_usage", "Disk at 71%"),
        ]
        for service, sev, kind, msg in alerts:
            r = await c.post(
                "/alerts/ingest",
                headers=key,
                json={
                    "service_id": svc[service]["id"],
                    "severity": sev,
                    "alert_type": kind,
                    "message": msg,
                    "source": "seed-script",
                },
            )
            r.raise_for_status()
            await asyncio.sleep(0.4)

        await asyncio.sleep(1.5)  # let the worker finish the last alert before we read the totals
        d = (await c.get("/dashboard/summary", headers=admin)).json()
        print(
            f"Seeded. Active incidents: {d['active_incidents']}  by status: {d['incidents_by_status']}"
        )
        print(f"Sign in with any of: {', '.join(e for e, _, _ in USERS)}  /  password: {PASSWORD}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--base", default="http://localhost:8000/api/v1")
    ap.add_argument(
        "--api-key",
        default=os.environ.get("ALERT_INGEST_API_KEY", ""),
        help="defaults to $ALERT_INGEST_API_KEY (same value as backend/.env)",
    )
    args = ap.parse_args()
    if not args.api_key:
        sys.exit("Set ALERT_INGEST_API_KEY or pass --api-key (same value as in backend/.env).")
    sys.exit(asyncio.run(main(args.base, args.api_key)))
