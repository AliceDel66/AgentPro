from httpx import AsyncClient


async def runner_auth_headers(client: AsyncClient) -> dict[str, str]:
    code_response = await client.post(
        "/api/v1/auth/email-code", json={"email": "runner@example.com"}
    )
    code = code_response.json()["data"]["debugCode"]
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "runner@example.com",
            "code": code,
            "password": "Password123",
            "name": "Runner User",
        },
    )
    token = register_response.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def test_runner_job_lease_event_and_artifact(api_client: AsyncClient) -> None:
    headers = await runner_auth_headers(api_client)

    create_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "parallel", "specId": "spec_001"},
    )
    assert create_response.status_code == 200
    job = create_response.json()["data"]
    assert job["engines"] == ["codex", "claude-code"]
    assert job["status"] == "queued"

    lease_response = await api_client.post(
        f"/api/v1/dev-jobs/{job['id']}/lease",
        headers=headers,
        json={"runnerId": "desktop-local"},
    )
    assert lease_response.status_code == 200
    assert lease_response.json()["data"]["leased"] is True

    event_response = await api_client.post(
        f"/api/v1/dev-jobs/{job['id']}/events",
        headers=headers,
        json={
            "phase": "typecheck",
            "message": "npm run typecheck passed",
            "progress": 45,
            "status": "running",
        },
    )
    assert event_response.status_code == 200
    assert event_response.json()["data"]["progress"] == 45

    artifact_response = await api_client.post(
        f"/api/v1/dev-jobs/{job['id']}/artifacts",
        headers=headers,
        json={
            "engine": "codex",
            "kind": "diff-summary",
            "summary": "完成候选实现",
            "payload": {"commit": "abc123"},
        },
    )
    assert artifact_response.status_code == 200
    assert artifact_response.json()["data"]["engine"] == "codex"

    events_response = await api_client.get(f"/api/v1/dev-jobs/{job['id']}/events", headers=headers)
    assert events_response.status_code == 200
    assert events_response.json()["data"][0]["phase"] == "typecheck"
