import pytest

from .conftest import API, advance

NIL = "00000000-0000-0000-0000-000000000000"


def body(service_id: str, **over):
    return {
        "title": "DB latency spike",
        "description": "p99 above 2s",
        "service_id": service_id,
        "severity": "SEV3",
        "priority": "MEDIUM",
        **over,
    }


# ---------------------------------------------------------------- create / read
async def test_engineer_can_create_incident_viewer_cannot(client, engineer, viewer, service):
    ok = await client.post(
        f"{API}/incidents/", headers=engineer["headers"], json=body(service["id"])
    )
    assert ok.status_code == 201
    data = ok.json()
    assert data["status"] == "OPEN"
    assert data["reporter_id"] == engineer["id"]
    assert data["acknowledged_at"] is None and data["resolved_at"] is None
    denied = await client.post(
        f"{API}/incidents/", headers=viewer["headers"], json=body(service["id"])
    )
    assert denied.status_code == 403


async def test_create_incident_validation(client, engineer, service):
    h = engineer["headers"]
    assert (
        await client.post(f"{API}/incidents/", headers=h, json=body(service["id"], title=""))
    ).status_code == 422
    assert (
        await client.post(f"{API}/incidents/", headers=h, json=body(service["id"], severity="SEV9"))
    ).status_code == 422


async def test_viewer_can_read_incidents(client, viewer, incident):
    assert (
        await client.get(f"{API}/incidents/{incident['id']}", headers=viewer["headers"])
    ).status_code == 200
    assert (await client.get(f"{API}/incidents/", headers=viewer["headers"])).json()["total"] == 1


async def test_unknown_incident_is_404(client, engineer):
    assert (
        await client.get(f"{API}/incidents/{NIL}", headers=engineer["headers"])
    ).status_code == 404


async def test_creation_writes_audit_event(client, engineer, incident):
    res = await client.get(
        f"{API}/incidents/{incident['id']}/timeline", headers=engineer["headers"]
    )
    events = res.json()
    assert [e["event_type"] for e in events] == ["CREATED"]
    assert events[0]["actor_id"] == engineer["id"]


# ------------------------------------------------------------ list / filter / search
async def test_list_filters_search_and_pagination(client, engineer, service):
    h = engineer["headers"]
    for title, sev in [
        ("Redis timeout", "SEV1"),
        ("Disk full on db-1", "SEV2"),
        ("Slow login page", "SEV3"),
    ]:
        await client.post(
            f"{API}/incidents/", headers=h, json=body(service["id"], title=title, severity=sev)
        )

    assert (await client.get(f"{API}/incidents/", headers=h, params={"severity": "SEV1"})).json()[
        "total"
    ] == 1
    found = (await client.get(f"{API}/incidents/", headers=h, params={"search": "disk"})).json()
    assert [i["title"] for i in found["items"]] == ["Disk full on db-1"]  # case-insensitive
    page = (await client.get(f"{API}/incidents/", headers=h, params={"size": 2, "page": 2})).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    assert (
        await client.get(f"{API}/incidents/", headers=h, params={"size": 500})
    ).status_code == 422


# ----------------------------------------------------------- status workflow
async def test_full_happy_path_sets_timestamps_and_audit_trail(client, engineer, incident):
    h, iid = engineer["headers"], incident["id"]
    after_ack = await advance(client, h, iid, "INVESTIGATING")
    assert after_ack["acknowledged_at"] is not None and after_ack["resolved_at"] is None
    done = await advance(client, h, iid, "IDENTIFIED", "MITIGATING", "RESOLVED")
    assert done["resolved_at"] is not None
    closed = await advance(client, h, iid, "CLOSED")
    assert closed["status"] == "CLOSED"

    events = (await client.get(f"{API}/incidents/{iid}/timeline", headers=h)).json()
    changes = [
        (e["old_value"], e["new_value"]) for e in events if e["event_type"] == "STATUS_CHANGE"
    ]
    assert changes == [
        ("OPEN", "INVESTIGATING"),
        ("INVESTIGATING", "IDENTIFIED"),
        ("IDENTIFIED", "MITIGATING"),
        ("MITIGATING", "RESOLVED"),
        ("RESOLVED", "CLOSED"),
    ]


@pytest.mark.parametrize("target", ["IDENTIFIED", "MITIGATING", "RESOLVED", "CLOSED", "OPEN"])
async def test_cannot_skip_ahead_from_open(client, engineer, incident, target):
    res = await client.patch(
        f"{API}/incidents/{incident['id']}/status",
        headers=engineer["headers"],
        json={"status": target},
    )
    assert res.status_code == 400
    assert "Cannot transition" in res.json()["detail"]


async def test_closed_is_terminal(client, engineer, incident):
    await advance(
        client,
        engineer["headers"],
        incident["id"],
        "INVESTIGATING",
        "IDENTIFIED",
        "MITIGATING",
        "RESOLVED",
        "CLOSED",
    )
    res = await client.patch(
        f"{API}/incidents/{incident['id']}/status",
        headers=engineer["headers"],
        json={"status": "INVESTIGATING"},
    )
    assert res.status_code == 400


async def test_reopening_resolved_incident_clears_resolved_at(client, engineer, incident):
    h, iid = engineer["headers"], incident["id"]
    await advance(client, h, iid, "INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED")
    reopened = await advance(client, h, iid, "INVESTIGATING")
    assert reopened["resolved_at"] is None
    assert reopened["acknowledged_at"] is not None  # first response time is kept


async def test_viewer_cannot_change_status(client, viewer, incident):
    res = await client.patch(
        f"{API}/incidents/{incident['id']}/status",
        headers=viewer["headers"],
        json={"status": "INVESTIGATING"},
    )
    assert res.status_code == 403


# --------------------------------------------------------- ownership on edits
async def test_only_reporter_assignee_or_admin_can_edit(
    client, engineer, other_engineer, admin, incident
):
    url = f"{API}/incidents/{incident['id']}"
    assert (
        await client.patch(url, headers=other_engineer["headers"], json={"title": "hijack"})
    ).status_code == 403
    assert (
        await client.patch(url, headers=engineer["headers"], json={"title": "mine"})
    ).status_code == 200
    assert (await client.patch(url, headers=admin["headers"], json={"priority": "URGENT"})).json()[
        "priority"
    ] == "URGENT"

    # Once assigned, the assignee gains edit rights too.
    await client.patch(
        f"{url}/assign", headers=engineer["headers"], json={"assignee_id": other_engineer["id"]}
    )
    assert (
        await client.patch(url, headers=other_engineer["headers"], json={"title": "now mine"})
    ).status_code == 200


async def test_partial_update_leaves_other_fields_alone(client, engineer, incident):
    res = await client.patch(
        f"{API}/incidents/{incident['id']}", headers=engineer["headers"], json={"severity": "SEV1"}
    )
    data = res.json()
    assert data["severity"] == "SEV1"
    assert data["title"] == incident["title"] and data["description"] == incident["description"]


# ----------------------------------------------------------------- assignment
async def test_assign_and_unassign_are_audited(client, engineer, other_engineer, incident):
    h, url = engineer["headers"], f"{API}/incidents/{incident['id']}"
    assigned = await client.patch(
        f"{url}/assign", headers=h, json={"assignee_id": other_engineer["id"]}
    )
    assert assigned.json()["assignee_id"] == other_engineer["id"]
    cleared = await client.patch(f"{url}/assign", headers=h, json={"assignee_id": None})
    assert cleared.json()["assignee_id"] is None
    events = [
        e
        for e in (await client.get(f"{url}/timeline", headers=h)).json()
        if e["event_type"] == "ASSIGNMENT_CHANGE"
    ]
    assert len(events) == 2
    assert events[0]["new_value"] == other_engineer["id"]
    assert events[1]["old_value"] == other_engineer["id"] and events[1]["new_value"] is None


async def test_viewer_cannot_assign(client, viewer, incident):
    res = await client.patch(
        f"{API}/incidents/{incident['id']}/assign",
        headers=viewer["headers"],
        json={"assignee_id": None},
    )
    assert res.status_code == 403


# ------------------------------------------------------------------- comments
async def test_comment_lifecycle_and_permissions(
    client, engineer, other_engineer, admin, viewer, incident
):
    url = f"{API}/incidents/{incident['id']}/comments"
    created = await client.post(
        url, headers=engineer["headers"], json={"body": "Rolling back deploy"}
    )
    assert created.status_code == 201
    cid = created.json()["id"]

    assert (
        await client.post(url, headers=viewer["headers"], json={"body": "hi"})
    ).status_code == 403
    assert (
        await client.post(url, headers=engineer["headers"], json={"body": ""})
    ).status_code == 422
    assert len((await client.get(url, headers=viewer["headers"])).json()) == 1  # viewers can read

    # only the author or an admin may delete
    assert (
        await client.delete(f"{url}/{cid}", headers=other_engineer["headers"])
    ).status_code == 403
    assert (await client.delete(f"{url}/{cid}", headers=admin["headers"])).status_code == 204
    assert (await client.get(url, headers=engineer["headers"])).json() == []


async def test_comment_added_event_and_wrong_incident_delete(client, engineer, service, incident):
    h = engineer["headers"]
    c = (
        await client.post(
            f"{API}/incidents/{incident['id']}/comments", headers=h, json={"body": "x"}
        )
    ).json()
    events = (await client.get(f"{API}/incidents/{incident['id']}/timeline", headers=h)).json()
    assert "COMMENT_ADDED" in [e["event_type"] for e in events]
    other = (await client.post(f"{API}/incidents/", headers=h, json=body(service["id"]))).json()
    # A comment can't be deleted through a different incident's URL.
    res = await client.delete(f"{API}/incidents/{other['id']}/comments/{c['id']}", headers=h)
    assert res.status_code == 404


# ----------------------------------------------------------------- postmortems
PM = {
    "summary": "Checkout outage",
    "impact": "12 minutes of failed payments",
    "root_cause": "Bad config push",
    "timeline": "10:00 alert, 10:12 fixed",
    "resolution": "Rolled back",
}


async def resolve(client, headers, incident_id):
    await advance(
        client, headers, incident_id, "INVESTIGATING", "IDENTIFIED", "MITIGATING", "RESOLVED"
    )


async def test_postmortem_blocked_until_incident_resolved(client, engineer, incident):
    res = await client.post(
        f"{API}/incidents/{incident['id']}/postmortem", headers=engineer["headers"], json=PM
    )
    assert res.status_code == 400
    assert "RESOLVED or CLOSED" in res.json()["detail"]


async def test_postmortem_create_read_update_and_duplicate(client, engineer, incident):
    h, url = engineer["headers"], f"{API}/incidents/{incident['id']}/postmortem"
    assert (await client.get(url, headers=h)).status_code == 404  # none yet
    await resolve(client, h, incident["id"])

    created = await client.post(url, headers=h, json=PM)
    assert created.status_code == 201 and created.json()["author_id"] == engineer["id"]
    assert (await client.post(url, headers=h, json=PM)).status_code == 409

    patched = await client.patch(url, headers=h, json={"lessons_learned": "Canary first"})
    assert patched.json()["lessons_learned"] == "Canary first"
    assert patched.json()["root_cause"] == PM["root_cause"]
    assert (await client.get(url, headers=h)).status_code == 200


async def test_postmortem_write_permissions(
    client, engineer, other_engineer, viewer, admin, incident
):
    await resolve(client, engineer["headers"], incident["id"])
    url = f"{API}/incidents/{incident['id']}/postmortem"
    assert (await client.post(url, headers=other_engineer["headers"], json=PM)).status_code == 403
    assert (await client.post(url, headers=viewer["headers"], json=PM)).status_code == 403
    assert (await client.post(url, headers=admin["headers"], json=PM)).status_code == 201
    assert (
        await client.patch(url, headers=other_engineer["headers"], json={"summary": "x"})
    ).status_code == 403
    assert (await client.get(url, headers=viewer["headers"])).status_code == 200  # read is open


async def test_postmortem_requires_all_core_fields(client, engineer, incident):
    await resolve(client, engineer["headers"], incident["id"])
    partial = {k: v for k, v in PM.items() if k != "root_cause"}
    res = await client.post(
        f"{API}/incidents/{incident['id']}/postmortem", headers=engineer["headers"], json=partial
    )
    assert res.status_code == 422
