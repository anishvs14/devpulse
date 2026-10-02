import jwt

from app.core.config import get_settings
from app.core.security import create_access_token

from .conftest import API, make_user


async def test_register_creates_engineer_and_never_returns_password(client):
    res = await client.post(
        f"{API}/auth/register",
        json={"email": "a@example.com", "full_name": "A", "password": "password123"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["role"] == "ENGINEER"
    assert "password" not in body and "hashed_password" not in body


async def test_register_cannot_self_elevate_role(client):
    # `role` isn't part of UserCreate, so an extra field is ignored — never trusted.
    res = await client.post(
        f"{API}/auth/register",
        json={
            "email": "b@example.com",
            "full_name": "B",
            "password": "password123",
            "role": "ADMIN",
        },
    )
    assert res.status_code == 201
    assert res.json()["role"] == "ENGINEER"


async def test_register_duplicate_email_rejected(client):
    payload = {"email": "dup@example.com", "full_name": "D", "password": "password123"}
    assert (await client.post(f"{API}/auth/register", json=payload)).status_code == 201
    res = await client.post(f"{API}/auth/register", json=payload)
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"]


async def test_register_rejects_short_and_overlong_passwords(client):
    base = {"email": "p@example.com", "full_name": "P"}
    assert (
        await client.post(f"{API}/auth/register", json={**base, "password": "short"})
    ).status_code == 422
    # bcrypt's 72-byte limit is enforced at the schema layer, not silently truncated
    assert (
        await client.post(f"{API}/auth/register", json={**base, "password": "x" * 73})
    ).status_code == 422


async def test_login_success_returns_bearer_token(client):
    await make_user(client, "login@example.com")
    res = await client.post(
        f"{API}/auth/login", data={"username": "login@example.com", "password": "password123"}
    )
    assert res.status_code == 200
    assert res.json()["token_type"] == "bearer"
    assert res.json()["access_token"]


async def test_login_wrong_password_and_unknown_user_look_identical(client):
    await make_user(client, "real@example.com")
    wrong_pw = await client.post(
        f"{API}/auth/login", data={"username": "real@example.com", "password": "nope-nope"}
    )
    no_user = await client.post(
        f"{API}/auth/login", data={"username": "ghost@example.com", "password": "password123"}
    )
    assert wrong_pw.status_code == no_user.status_code == 401
    # Same message either way, so the endpoint can't be used to discover which emails exist.
    assert wrong_pw.json()["detail"] == no_user.json()["detail"]


async def test_me_requires_token(client):
    assert (await client.get(f"{API}/users/me")).status_code == 401


async def test_me_returns_current_user(client, engineer):
    res = await client.get(f"{API}/users/me", headers=engineer["headers"])
    assert res.status_code == 200
    assert res.json()["email"] == engineer["email"]


async def test_garbage_token_rejected(client):
    res = await client.get(f"{API}/users/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401


async def test_expired_token_rejected(client, engineer):
    expired = create_access_token(subject=engineer["id"], role="ENGINEER", expires_minutes=-1)
    res = await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401


async def test_token_signed_with_wrong_key_rejected(client, engineer):
    forged = jwt.encode(
        {"sub": engineer["id"], "role": "ADMIN"},
        "some-other-secret",
        algorithm=get_settings().algorithm,
    )
    res = await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 401


async def test_user_list_is_admin_only(client, admin, engineer, viewer):
    assert (await client.get(f"{API}/users/", headers=admin["headers"])).status_code == 200
    assert (await client.get(f"{API}/users/", headers=engineer["headers"])).status_code == 403
    assert (await client.get(f"{API}/users/", headers=viewer["headers"])).status_code == 403


async def test_directory_readable_by_any_user_and_leaks_no_email(client, viewer, admin):
    res = await client.get(f"{API}/users/directory", headers=viewer["headers"])
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 2
    for row in rows:
        assert set(row) == {"id", "full_name", "role"}


async def test_directory_requires_auth(client):
    assert (await client.get(f"{API}/users/directory")).status_code == 401
