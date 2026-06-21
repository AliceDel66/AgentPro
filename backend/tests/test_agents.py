import json

import pytest
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


async def deliver_agent(
    client: AsyncClient, headers: dict[str, str], title: str, message: str
) -> tuple[str, str]:
    """Drive a requirement all the way to an accepted review and return (requirementId, specId)."""
    requirement = await client.post(
        "/api/v1/requirements", headers=headers, json={"title": title, "initialMessage": message}
    )
    requirement_id = requirement.json()["data"]["id"]
    spec = await client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate", headers=headers
    )
    spec_id = spec.json()["data"]["id"]
    job = await client.post(
        "/api/v1/dev-jobs", headers=headers, json={"strategy": "codex", "specId": spec_id}
    )
    job_id = job.json()["data"]["id"]
    await client.post(
        f"/api/v1/dev-jobs/{job_id}/lease", headers=headers, json={"runnerId": "desktop-local"}
    )
    await client.post(
        f"/api/v1/dev-jobs/{job_id}/events",
        headers=headers,
        json={"phase": "done", "message": "done", "status": "completed", "progress": 100},
    )
    review = await client.post("/api/v1/reviews", headers=headers, json={"jobId": job_id})
    review_id = review.json()["data"]["id"]
    await client.post(f"/api/v1/reviews/{review_id}/accept", headers=headers, json={})
    return requirement_id, spec_id


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


async def test_run_delivered_agent_streams_tokens(
    api_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = await register_headers(api_client, "agents-run@example.com")
    await api_client.put(
        "/api/v1/model/config",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://ai.example.com/v1",
            "model": "gpt-agent",
            "apiKey": "run-secret",
        },
    )
    requirement_id, _ = await deliver_agent(api_client, headers, "周报助手", "每周整理团队周报")

    captured: dict[str, object] = {}

    async def fake_stream(base_url, api_key, model, messages):
        captured["base_url"] = base_url
        captured["model"] = model
        captured["system"] = messages[0]["content"]
        captured["user"] = messages[1]["content"]
        for token in ["好的", "，", "周报", "如下"]:
            yield token

    monkeypatch.setattr(
        "app.modules.agents.router.call_openai_chat_completion_stream", fake_stream
    )

    tokens: list[str] = []
    final: dict[str, object] | None = None
    event = None
    async with api_client.stream(
        "POST",
        f"/api/v1/agents/{requirement_id}/run",
        headers=headers,
        json={"input": "帮我写本周周报"},
    ) as response:
        assert response.status_code == 200
        async for line in response.aiter_lines():
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data = json.loads(line.split(":", 1)[1].strip())
                if event == "token":
                    tokens.append(str(data["content"]))
                elif event == "detail":
                    final = data

    assert "".join(tokens) == "好的，周报如下"
    assert final is not None
    assert final["output"] == "好的，周报如下"
    assert final["model"] == "gpt-agent"
    # The user's configured model + the agent's spec drove the run.
    assert captured["model"] == "gpt-agent"
    assert "周报助手" in str(captured["system"])
    assert captured["user"] == "帮我写本周周报"


async def test_run_requires_model_config(api_client: AsyncClient) -> None:
    headers = await register_headers(api_client, "agents-nomodel@example.com")
    requirement_id, _ = await deliver_agent(api_client, headers, "无模型 Agent", "做点事")
    response = await api_client.post(
        f"/api/v1/agents/{requirement_id}/run", headers=headers, json={"input": "run"}
    )
    assert response.status_code == 400


async def test_run_rejects_undelivered_agent(api_client: AsyncClient) -> None:
    headers = await register_headers(api_client, "agents-undelivered@example.com")
    requirement = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={"title": "草稿 Agent", "initialMessage": "随便做点东西"},
    )
    requirement_id = requirement.json()["data"]["id"]
    await api_client.post(f"/api/v1/requirements/{requirement_id}/spec/generate", headers=headers)
    response = await api_client.post(
        f"/api/v1/agents/{requirement_id}/run", headers=headers, json={"input": "run"}
    )
    assert response.status_code == 409
