from importlib import import_module

import pytest
from httpx import AsyncClient


async def get_access_token(client: AsyncClient) -> str:
    code_response = await client.post(
        "/api/v1/auth/email-code", json={"email": "model@example.com"}
    )
    code = code_response.json()["data"]["debugCode"]
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "model@example.com",
            "code": code,
            "password": "Password123",
            "name": "Model User",
        },
    )
    return register_response.json()["data"]["accessToken"]


async def test_model_config_save_get_list_and_test(api_client: AsyncClient) -> None:
    token = await get_access_token(api_client)
    headers = {"Authorization": f"Bearer {token}"}

    empty_response = await api_client.get("/api/v1/model/config", headers=headers)
    assert empty_response.status_code == 200
    assert empty_response.json()["data"]["secretSaved"] is False

    save_response = await api_client.put(
        "/api/v1/model/config",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://example.com/v1",
            "model": "gpt-4o",
            "apiKey": "test-model-key",
        },
    )
    assert save_response.status_code == 200
    saved = save_response.json()["data"]
    assert saved == {
        "provider": "sub2api",
        "baseUrl": "https://example.com/v1",
        "model": "gpt-4o",
        "secretSaved": True,
    }

    list_response = await api_client.get("/api/v1/model/list", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["data"] == ["gpt-4o"]

    test_response = await api_client.post(
        "/api/v1/model/test",
        headers=headers,
        json={"provider": "sub2api"},
    )
    assert test_response.status_code == 200
    assert test_response.json()["data"]["connected"] is True
    assert test_response.json()["data"]["models"] == ["gpt-4o"]


async def test_model_config_requires_auth(api_client: AsyncClient) -> None:
    response = await api_client.get("/api/v1/model/config")
    assert response.status_code == 401


async def test_model_test_uses_request_base_url_and_api_key(
    api_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = await get_access_token(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    await api_client.put(
        "/api/v1/model/config",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://saved.example.com/v1",
            "model": "saved-model",
            "apiKey": "saved-key",
        },
    )

    captured: dict[str, str | None] = {}

    async def fake_fetch_model_names(base_url: str, api_key: str | None) -> list[str]:
        captured["base_url"] = base_url
        captured["api_key"] = api_key
        return ["fresh-a", "fresh-b"]

    router_module = import_module("app.modules.models.router")
    monkeypatch.setattr(router_module, "fetch_openai_model_names", fake_fetch_model_names)
    response = await api_client.post(
        "/api/v1/model/test",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://input.example.com/v1",
            "apiKey": "input-key",
            "model": "saved-model",
        },
    )

    assert response.status_code == 200
    assert captured == {
        "base_url": "https://input.example.com/v1",
        "api_key": "input-key",
    }
    assert response.json()["data"]["models"] == ["fresh-a", "fresh-b"]

    async def fake_fetch_empty_models(base_url: str, api_key: str | None) -> list[str]:
        captured["base_url"] = base_url
        captured["api_key"] = api_key
        return []

    monkeypatch.setattr(router_module, "fetch_openai_model_names", fake_fetch_empty_models)
    empty_response = await api_client.post(
        "/api/v1/model/test",
        headers=headers,
        json={
            "provider": "sub2api",
            "baseUrl": "https://empty.example.com/v1",
            "apiKey": "empty-key",
        },
    )

    assert empty_response.status_code == 200
    assert captured == {
        "base_url": "https://empty.example.com/v1",
        "api_key": "empty-key",
    }
    assert empty_response.json()["data"]["models"] == []
