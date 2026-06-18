import json
from importlib import import_module

import pytest
from httpx import AsyncClient

from app.modules.requirements.graph import run_requirement_graph


async def auth_headers(client: AsyncClient) -> dict[str, str]:
    code_response = await client.post(
        "/api/v1/auth/email-code",
        json={"email": "requirement@example.com"},
    )
    code = code_response.json()["data"]["debugCode"]
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "requirement@example.com",
            "code": code,
            "password": "Password123",
            "name": "Requirement User",
        },
    )
    token = register_response.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def parse_sse_events(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in text.strip().split("\n\n"):
        event = "message"
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data_lines.append(line.removeprefix("data:").strip())
        if data_lines:
            events.append((event, json.loads("\n".join(data_lines))))
    return events


async def test_requirement_interview_flow(api_client: AsyncClient) -> None:
    headers = await auth_headers(api_client)
    create_response = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={
            "title": "电商售后客服 Agent",
            "initialMessage": "我想做一个自动客服 Agent，处理退换货和物流查询。",
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]
    requirement_id = created["id"]
    assert created["maturity"] > 0
    assert created["followupQuestions"]
    assert created["graphRunId"]

    detail_response = await api_client.get(
        f"/api/v1/requirements/{requirement_id}",
        headers=headers,
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["followupQuestions"]
    assert detail["safetyReview"]["riskLevel"] in {"low", "medium"}

    message_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/messages",
        headers=headers,
        json={"content": "主要用户是客服新人，需要查订单系统，但退款必须人工审批。"},
    )
    assert message_response.status_code == 200
    after_message = message_response.json()["data"]
    assert len(after_message["messages"]) >= 2
    assert after_message["safetyReview"]["riskLevel"] in {"low", "medium"}

    confirm_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/followups/confirm",
        headers=headers,
        json={
            "decisions": [{"key": "permissions", "value": "退款必须人工审批", "confirmed": True}]
        },
    )
    assert confirm_response.status_code == 200
    confirmed = confirm_response.json()["data"]
    assert confirmed["decisions"][0]["key"] == "permissions"

    list_response = await api_client.get("/api/v1/requirements", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["data"][0]["title"] == "电商售后客服 Agent"

    spec_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate",
        headers=headers,
        json={},
    )
    assert spec_response.status_code == 200
    spec = spec_response.json()["data"]
    assert spec["requirementId"] == requirement_id
    assert spec["status"] == "draft"
    assert "approvalChecklist" in spec["body"]

    get_spec_response = await api_client.get(
        f"/api/v1/requirements/{requirement_id}/spec",
        headers=headers,
    )
    assert get_spec_response.status_code == 200
    assert get_spec_response.json()["data"]["id"] == spec["id"]

    approve_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/approve",
        headers=headers,
        json={},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["data"]["status"] == "approved"
    assert approve_response.json()["data"]["spec"]["status"] == "approved"

    archive_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/archive",
        headers=headers,
        json={},
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["data"]["status"] == "archived"


def test_requirement_graph_filters_confirmed_followup_keys() -> None:
    state = run_requirement_graph(
        [
            {
                "role": "user",
                "content": "我想制作一个开发 Agent，帮我把产品需求拆成任务。",
            }
        ],
        confirmed_decisions=[
            {
                "key": "target_users",
                "value": "主要给产品、研发、测试和项目负责人使用。",
                "confirmed": True,
            }
        ],
    )

    followup_keys = {item["key"] for item in state["followupQuestions"]}
    assert "target_users" not in followup_keys
    assert "target_users" not in state["gaps"]


async def test_confirmed_followup_answers_are_not_repeated(api_client: AsyncClient) -> None:
    headers = await auth_headers(api_client)
    create_response = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={
            "title": "开发 Agent",
            "initialMessage": "我想制作一个开发 Agent，帮我把产品需求拆成任务。",
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]
    requirement_id = created["id"]
    first_question = created["followupQuestions"][0]

    confirm_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/followups/confirm",
        headers=headers,
        json={
            "decisions": [
                {
                    "key": first_question["key"],
                    "value": "主要给产品、研发、测试和项目负责人使用。",
                    "confirmed": True,
                }
            ]
        },
    )

    assert confirm_response.status_code == 200
    confirmed = confirm_response.json()["data"]
    remaining_keys = {item["key"] for item in confirmed["followupQuestions"]}
    assert first_question["key"] not in remaining_keys
    assert confirmed["messages"][-2]["role"] == "user"
    assert "已确认反问" in confirmed["messages"][-2]["content"]
    assert first_question["question"] not in confirmed["messages"][-1]["content"]


async def test_requirement_chat_streams_tokens_and_detail(api_client: AsyncClient) -> None:
    headers = await auth_headers(api_client)
    async with api_client.stream(
        "POST",
        "/api/v1/requirements/stream",
        headers=headers,
        json={
            "title": "直播运营 Agent",
            "initialMessage": "我想做一个直播运营 Agent，帮我整理商品脚本和观众问题。",
        },
    ) as response:
        assert response.status_code == 200
        body = await response.aread()

    events = parse_sse_events(body.decode())
    token_events = [payload for event, payload in events if event == "token"]
    detail_events = [payload for event, payload in events if event == "detail"]
    assert token_events
    assert "".join(item["content"] for item in token_events)
    assert detail_events
    created = detail_events[-1]
    assert created["id"]
    assert created["messages"][-1]["role"] == "assistant"
    assert created["messages"][-1]["content"]

    async with api_client.stream(
        "POST",
        f"/api/v1/requirements/{created['id']}/messages/stream",
        headers=headers,
        json={"content": "脚本要按美妆类目，不能自动承诺库存和价格。"},
    ) as response:
        assert response.status_code == 200
        message_body = await response.aread()

    message_events = parse_sse_events(message_body.decode())
    message_details = [payload for event, payload in message_events if event == "detail"]
    assert message_details[-1]["id"] == created["id"]
    assert len(message_details[-1]["messages"]) >= 4


async def test_requirement_chat_uses_saved_ai_model_config(
    api_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await auth_headers(api_client)
    await api_client.put(
        "/api/v1/model/config",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://ai.example.com/v1",
            "model": "gpt-test-requirements",
            "apiKey": "requirement-secret",
        },
    )

    captured: dict[str, object] = {}

    async def fake_chat_completion(
        base_url: str,
        api_key: str | None,
        model: str,
        messages: list[dict[str, str]],
    ) -> str:
        captured["base_url"] = base_url
        captured["api_key"] = api_key
        captured["model"] = model
        captured["messages"] = messages
        return json.dumps(
            {
                "assistantMessage": "AI 已接入：我会先确认目标用户和外部工具权限。",
                "summary": "用户希望创建一个能处理工单分派的 Agent。",
                "gaps": ["target_users", "tools"],
                "followupQuestions": [
                    {
                        "key": "target_users",
                        "question": "这个 Agent 主要服务哪些用户角色？",
                        "reason": "确认使用场景",
                    }
                ],
                "decisions": [
                    {"key": "scope", "value": "处理工单分派", "confirmed": False}
                ],
                "specDraft": {
                    "name": "工单分派 Agent",
                    "objective": "提升工单流转效率",
                    "capabilities": ["理解工单", "推荐分派"],
                    "openQuestions": [],
                    "decisions": [],
                },
                "safetyReview": {"riskLevel": "low", "risks": []},
            },
            ensure_ascii=False,
        )

    ai_module = import_module("app.modules.requirements.ai_service")
    monkeypatch.setattr(ai_module, "call_openai_chat_completion", fake_chat_completion)

    create_response = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={
            "title": "工单分派 Agent",
            "initialMessage": "我想让 Agent 帮客服主管分派售后工单。",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()["data"]
    assert captured["base_url"] == "https://ai.example.com/v1"
    assert captured["api_key"] == "requirement-secret"
    assert captured["model"] == "gpt-test-requirements"
    assert "chat/completions" not in str(captured["base_url"])
    assert created["summary"] == "用户希望创建一个能处理工单分派的 Agent。"
    assert created["followupQuestions"][0]["key"] == "target_users"
    assert created["messages"][-1]["content"] == "AI 已接入：我会先确认目标用户和外部工具权限。"


async def test_requirement_chat_falls_back_when_ai_fails(
    api_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await auth_headers(api_client)
    await api_client.put(
        "/api/v1/model/config",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://broken.example.com/v1",
            "model": "broken-model",
            "apiKey": "broken-secret",
        },
    )

    async def failing_chat_completion(
        base_url: str,
        api_key: str | None,
        model: str,
        messages: list[dict[str, str]],
    ) -> str:
        raise RuntimeError("service unavailable")

    ai_module = import_module("app.modules.requirements.ai_service")
    monkeypatch.setattr(ai_module, "call_openai_chat_completion", failing_chat_completion)

    create_response = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={
            "title": "售后客服 Agent",
            "initialMessage": "我想做一个自动客服 Agent。",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()["data"]
    assert created["followupQuestions"]
    assert "售后" in created["messages"][-1]["content"]
    assert "订单" in created["messages"][-1]["content"]


async def test_requirement_chat_keeps_plain_text_ai_response(
    api_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await auth_headers(api_client)
    await api_client.put(
        "/api/v1/model/config",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://plain-text.example.com/v1",
            "model": "plain-text-model",
            "apiKey": "plain-text-secret",
        },
    )

    async def plain_text_chat_completion(
        base_url: str,
        api_key: str | None,
        model: str,
        messages: list[dict[str, str]],
    ) -> str:
        return (
            "这个人事简历筛选 Agent 的关键不是泛泛地问权限，"
            "而是先确认岗位 JD、简历来源、评分维度和 HR 复核边界。"
        )

    ai_module = import_module("app.modules.requirements.ai_service")
    monkeypatch.setattr(ai_module, "call_openai_chat_completion", plain_text_chat_completion)

    create_response = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={
            "title": "人事简历筛选 Agent",
            "initialMessage": "我想制作一个人事agent，帮我进行简历筛选等任务",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()["data"]
    assert created["messages"][-1]["content"].startswith("这个人事简历筛选 Agent")
    assert any("简历" in item["question"] for item in created["followupQuestions"])


async def test_get_spec_returns_latest_generated_version(api_client: AsyncClient) -> None:
    headers = await auth_headers(api_client)
    create = await api_client.post(
        "/api/v1/requirements",
        headers=headers,
        json={"title": "幂等需求", "initialMessage": "做一个排班 agent"},
    )
    requirement_id = create.json()["data"]["id"]

    first = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate", headers=headers
    )
    second = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate", headers=headers
    )
    assert second.json()["data"]["version"] > first.json()["data"]["version"]

    # GET latest spec is a read: it returns the newest version without creating another.
    latest = await api_client.get(
        f"/api/v1/requirements/{requirement_id}/spec", headers=headers
    )
    assert latest.status_code == 200
    assert latest.json()["data"]["version"] == second.json()["data"]["version"]
