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


async def test_password_reset_flow(api_client: AsyncClient) -> None:
    await register_user(api_client)  # alice@example.com / Password123

    code_response = await api_client.post(
        "/api/v1/auth/email-code",
        json={"email": "alice@example.com", "purpose": "reset"},
    )
    reset_code = code_response.json()["data"]["debugCode"]
    assert len(reset_code) == 6

    confirm = await api_client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"email": "alice@example.com", "code": reset_code, "password": "NewPassword456"},
    )
    assert confirm.status_code == 200
    assert confirm.json()["data"]["reset"] is True

    old_login = await api_client.post(
        "/api/v1/auth/login",
        json={"identifier": "alice@example.com", "password": "Password123"},
    )
    assert old_login.status_code == 401
    new_login = await api_client.post(
        "/api/v1/auth/login",
        json={"identifier": "alice@example.com", "password": "NewPassword456"},
    )
    assert new_login.status_code == 200


async def test_password_reset_rejects_invalid_code(api_client: AsyncClient) -> None:
    await register_user(api_client)
    response = await api_client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"email": "alice@example.com", "code": "000000", "password": "NewPassword456"},
    )
    assert response.status_code == 400


async def test_login_throttled_after_repeated_failures(api_client: AsyncClient) -> None:
    payload = {"identifier": "bruteforce@example.com", "password": "wrong-password"}
    statuses = []
    for _ in range(6):
        response = await api_client.post("/api/v1/auth/login", json=payload)
        statuses.append(response.status_code)
    assert statuses[:5] == [401] * 5
    assert statuses[5] == 429  # locked out after 5 failures within the window


async def test_login_failure_counter_resets_on_success(api_client: AsyncClient) -> None:
    await register_user(api_client)  # alice@example.com / Password123
    wrong = {"identifier": "alice@example.com", "password": "nope"}
    correct = {"identifier": "alice@example.com", "password": "Password123"}

    for _ in range(4):
        assert (await api_client.post("/api/v1/auth/login", json=wrong)).status_code == 401
    assert (await api_client.post("/api/v1/auth/login", json=correct)).status_code == 200
    # The success reset the counter, so subsequent attempts are not immediately locked.
    for _ in range(4):
        assert (await api_client.post("/api/v1/auth/login", json=wrong)).status_code == 401
