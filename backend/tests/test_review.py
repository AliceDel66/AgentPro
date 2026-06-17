from httpx import AsyncClient


async def review_auth_headers(client: AsyncClient) -> dict[str, str]:
    code_response = await client.post(
        "/api/v1/auth/email-code", json={"email": "review@example.com"}
    )
    code = code_response.json()["data"]["debugCode"]
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "review@example.com",
            "code": code,
            "password": "Password123",
            "name": "Review User",
        },
    )
    token = register_response.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def test_review_report_accept_and_rework(api_client: AsyncClient) -> None:
    headers = await review_auth_headers(api_client)
    job_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "codex", "specId": "spec_review_001"},
    )
    job_id = job_response.json()["data"]["id"]
    await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/events",
        headers=headers,
        json={"phase": "tests", "message": "pytest passed", "progress": 95},
    )
    await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/artifacts",
        headers=headers,
        json={
            "engine": "codex",
            "kind": "test-report",
            "summary": "pytest passed",
            "payload": {"tests": "passed"},
        },
    )

    review_response = await api_client.post(
        "/api/v1/reviews",
        headers=headers,
        json={"jobId": job_id},
    )
    assert review_response.status_code == 200
    review = review_response.json()["data"]
    assert review["recommendedEngine"] == "codex"
    assert review["score"] >= 80
    assert len(review["findings"]) == 3

    get_response = await api_client.get(f"/api/v1/reviews/{review['id']}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["data"]["id"] == review["id"]

    accept_response = await api_client.post(
        f"/api/v1/reviews/{review['id']}/accept",
        headers=headers,
        json={},
    )
    assert accept_response.status_code == 200
    assert accept_response.json()["data"]["status"] == "accepted"

    rework_response = await api_client.post(
        f"/api/v1/reviews/{review['id']}/rework",
        headers=headers,
        json={},
    )
    assert rework_response.status_code == 200
    assert rework_response.json()["data"]["status"] == "rework_requested"
