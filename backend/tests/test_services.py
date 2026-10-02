from .conftest import API


async def test_admin_can_create_service_engineer_and_viewer_cannot(client, admin, engineer, viewer):
    payload = {"name": "svc", "owner_team": "t", "environment": "STAGING"}
    assert (
        await client.post(f"{API}/services/", headers=engineer["headers"], json=payload)
    ).status_code == 403
    assert (
        await client.post(f"{API}/services/", headers=viewer["headers"], json=payload)
    ).status_code == 403
    res = await client.post(f"{API}/services/", headers=admin["headers"], json=payload)
    assert res.status_code == 201
    assert res.json()["status"] == "UNKNOWN"  # new services start unchecked


async def test_service_endpoints_require_auth(client):
    assert (await client.get(f"{API}/services/")).status_code == 401


async def test_list_filters_and_pagination(client, admin):
    for i, env in enumerate(["PRODUCTION", "PRODUCTION", "STAGING"]):
        await client.post(
            f"{API}/services/",
            headers=admin["headers"],
            json={"name": f"s{i}", "owner_team": "t", "environment": env},
        )
    prod = await client.get(
        f"{API}/services/", headers=admin["headers"], params={"environment": "PRODUCTION"}
    )
    assert prod.json()["total"] == 2
    page = await client.get(
        f"{API}/services/", headers=admin["headers"], params={"size": 2, "page": 2}
    )
    body = page.json()
    assert body["total"] == 3 and len(body["items"]) == 1 and body["page"] == 2


async def test_invalid_enum_value_is_422(client, admin):
    res = await client.post(
        f"{API}/services/",
        headers=admin["headers"],
        json={"name": "x", "owner_team": "t", "environment": "MOON"},
    )
    assert res.status_code == 422


async def test_update_service_admin_only(client, admin, engineer, service):
    url = f"{API}/services/{service['id']}"
    assert (
        await client.patch(url, headers=engineer["headers"], json={"status": "DOWN"})
    ).status_code == 403
    res = await client.patch(url, headers=admin["headers"], json={"status": "DEGRADED"})
    assert res.status_code == 200 and res.json()["status"] == "DEGRADED"


async def test_get_unknown_service_is_404(client, admin):
    res = await client.get(
        f"{API}/services/00000000-0000-0000-0000-000000000000", headers=admin["headers"]
    )
    assert res.status_code == 404


async def test_delete_service_without_incidents(client, admin, service):
    assert (
        await client.delete(f"{API}/services/{service['id']}", headers=admin["headers"])
    ).status_code == 204
    assert (
        await client.get(f"{API}/services/{service['id']}", headers=admin["headers"])
    ).status_code == 404


async def test_cannot_delete_service_that_has_incidents(client, admin, service, incident):
    res = await client.delete(f"{API}/services/{service['id']}", headers=admin["headers"])
    assert res.status_code == 409
    # ...and the service must still be there afterwards (the rollback worked).
    assert (
        await client.get(f"{API}/services/{service['id']}", headers=admin["headers"])
    ).status_code == 200
