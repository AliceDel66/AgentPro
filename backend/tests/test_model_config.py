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
