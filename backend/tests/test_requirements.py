from httpx import AsyncClient


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
