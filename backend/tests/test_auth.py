from httpx import AsyncClient


async def register_user(client: AsyncClient) -> dict:
    code_response = await client.post(
        "/api/v1/auth/email-code", json={"email": "alice@example.com"}
    )
    assert code_response.status_code == 200
    code_payload = code_response.json()
    assert code_payload["ok"] is True
    code = code_payload["data"]["debugCode"]
    assert len(code) == 6

    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "alice@example.com",
            "code": code,
            "password": "Password123",
            "name": "Alice",
        },
    )
    assert register_response.status_code == 200
    payload = register_response.json()
    assert payload["ok"] is True
    assert payload["data"]["user"]["email"] == "alice@example.com"
    assert payload["data"]["accessToken"]
    assert payload["data"]["refreshToken"]
    return payload["data"]


async def test_register_login_me_refresh_logout(api_client: AsyncClient) -> None:
    session = await register_user(api_client)

    login_response = await api_client.post(
        "/api/v1/auth/login",
        json={"identifier": "alice@example.com", "password": "Password123"},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()["data"]
    assert login_payload["user"]["name"] == "Alice"

    me_response = await api_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {login_payload['accessToken']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["emailVerified"] is True

    refresh_response = await api_client.post(
        "/api/v1/auth/refresh",
        json={"refreshToken": session["refreshToken"]},
    )
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()["data"]
    assert refreshed["refreshToken"] != session["refreshToken"]

    logout_response = await api_client.post(
        "/api/v1/auth/logout",
        json={"refreshToken": refreshed["refreshToken"]},
    )
    assert logout_response.status_code == 200
    assert logout_response.json()["data"]["loggedOut"] is True


async def test_register_rejects_invalid_code(api_client: AsyncClient) -> None:
    await api_client.post("/api/v1/auth/email-code", json={"email": "bob@example.com"})
    response = await api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "bob@example.com",
            "code": "000000",
            "password": "Password123",
            "name": "Bob",
        },
    )
    assert response.status_code == 400
