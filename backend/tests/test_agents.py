from httpx import AsyncClient


async def register_headers(client: AsyncClient, email: str) -> dict[str, str]:
    code = (
        await client.post("/api/v1/auth/email-code", json={"email": email})
    ).json()["data"]["debugCode"]
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "code": code, "password": "Password123", "name": email.split("@")[0]},
    )
    return {"Authorization": f"Bearer {register.json()['data']['accessToken']}"}


async def test_list_delivered_agents_after_accepted_review(api_client: AsyncClient) -> None:
    headers = await register_headers(api_client, "agents@example.com")

    empty = await api_client.get("/api/v1/agents", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["data"] == []

    requirement = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={"title": "告警 Agent", "initialMessage": "把系统告警推送到飞书群"},
    )
    requirement_id = requirement.json()["data"]["id"]
    spec = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate", headers=headers
    )
    spec_id = spec.json()["data"]["id"]

    job = await api_client.post(
        "/api/v1/dev-jobs", headers=headers, json={"strategy": "codex", "specId": spec_id}
    )
    job_id = job.json()["data"]["id"]
    await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/lease", headers=headers, json={"runnerId": "desktop-local"}
    )
    await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/events",
        headers=headers,
        json={"phase": "done", "message": "done", "status": "completed", "progress": 100},
    )
    review = await api_client.post("/api/v1/reviews", headers=headers, json={"jobId": job_id})
    review_id = review.json()["data"]["id"]

    # Not delivered until the review is accepted.
    before = await api_client.get("/api/v1/agents", headers=headers)
    assert before.json()["data"] == []

    await api_client.post(f"/api/v1/reviews/{review_id}/accept", headers=headers, json={})

    agents = await api_client.get("/api/v1/agents", headers=headers)
    assert agents.status_code == 200
    data = agents.json()["data"]
    assert len(data) == 1
    assert data[0]["requirementId"] == requirement_id
    assert data[0]["title"] == "告警 Agent"
    assert data[0]["specId"] == spec_id
    assert data[0]["deliveryMode"] == "external"  # 飞书 → external (from delivery-target slice A)


async def test_delivered_agents_are_user_scoped(api_client: AsyncClient) -> None:
    other = await register_headers(api_client, "agents-other@example.com")
    response = await api_client.get("/api/v1/agents", headers=other)
    assert response.status_code == 200
    assert response.json()["data"] == []
