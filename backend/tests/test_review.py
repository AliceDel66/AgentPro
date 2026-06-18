from httpx import AsyncClient


async def register_headers(client: AsyncClient, email: str) -> dict[str, str]:
    code_response = await client.post("/api/v1/auth/email-code", json={"email": email})
    code = code_response.json()["data"]["debugCode"]
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "code": code,
            "password": "Password123",
            "name": email.split("@")[0],
        },
    )
    token = register_response.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def review_auth_headers(client: AsyncClient) -> dict[str, str]:
    return await register_headers(client, "review@example.com")


async def create_owned_spec(client: AsyncClient, headers: dict[str, str]) -> str:
    requirement_response = await client.post(
        "/api/v1/requirements",
        headers=headers,
        json={"title": "评审需求", "initialMessage": "做一个发票核验 agent"},
    )
    requirement_id = requirement_response.json()["data"]["id"]
    spec_response = await client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate", headers=headers
    )
    return spec_response.json()["data"]["id"]


async def test_review_report_accept_and_rework(api_client: AsyncClient) -> None:
    headers = await review_auth_headers(api_client)
    spec_id = await create_owned_spec(api_client, headers)
    job_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "codex", "specId": spec_id},
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
            "kind": "run-log",
            "summary": "codex run completed",
            "payload": {
                "exitCode": 0,
                "durationSeconds": 18,
                "stdout": "pytest passed",
                "stderr": "",
                "diffStat": "src/app.py | 4 ++--",
            },
        },
    )
    await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/artifacts",
        headers=headers,
        json={
            "engine": "codex",
            "kind": "diff-summary",
            "summary": "src/app.py | 4 ++--",
            "payload": {"stat": "src/app.py | 4 ++--", "diff": "diff --git a/src/app.py"},
        },
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
    assert len(review["findings"]) == 4
    assert any(item["category"] == "test" for item in review["findings"])

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

    merge_response = await api_client.post(
        f"/api/v1/reviews/{review['id']}/merge",
        headers=headers,
        json={},
    )
    assert merge_response.status_code == 200
    assert merge_response.json()["data"]["status"] == "merge_planned"


async def test_latest_review_reads_without_creating(api_client: AsyncClient) -> None:
    headers = await register_headers(api_client, "latest@example.com")
    spec_id = await create_owned_spec(api_client, headers)
    job_response = await api_client.post(
        "/api/v1/dev-jobs", headers=headers, json={"strategy": "codex", "specId": spec_id}
    )
    job_id = job_response.json()["data"]["id"]

    # No report yet: latest returns null instead of creating one.
    empty = await api_client.get(f"/api/v1/reviews/latest?jobId={job_id}", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["data"] is None

    created = await api_client.post("/api/v1/reviews", headers=headers, json={"jobId": job_id})
    review_id = created.json()["data"]["id"]

    latest = await api_client.get(f"/api/v1/reviews/latest?jobId={job_id}", headers=headers)
    assert latest.status_code == 200
    assert latest.json()["data"]["id"] == review_id

    # Another user cannot read this report via latest.
    attacker = await register_headers(api_client, "latest-attacker@example.com")
    cross = await api_client.get(f"/api/v1/reviews/latest?jobId={job_id}", headers=attacker)
    assert cross.status_code == 200
    assert cross.json()["data"] is None


async def test_review_list_returns_only_current_user_reports(api_client: AsyncClient) -> None:
    owner = await register_headers(api_client, "review-list-owner@example.com")
    owner_spec_id = await create_owned_spec(api_client, owner)
    owner_job = await api_client.post(
        "/api/v1/dev-jobs",
        headers=owner,
        json={"strategy": "codex", "specId": owner_spec_id},
    )
    owner_review = await api_client.post(
        "/api/v1/reviews",
        headers=owner,
        json={"jobId": owner_job.json()["data"]["id"]},
    )
    assert owner_review.status_code == 200

    other = await register_headers(api_client, "review-list-other@example.com")
    other_spec_id = await create_owned_spec(api_client, other)
    other_job = await api_client.post(
        "/api/v1/dev-jobs",
        headers=other,
        json={"strategy": "codex", "specId": other_spec_id},
    )
    await api_client.post(
        "/api/v1/reviews",
        headers=other,
        json={"jobId": other_job.json()["data"]["id"]},
    )

    list_response = await api_client.get("/api/v1/reviews", headers=owner)
    assert list_response.status_code == 200
    reports = list_response.json()["data"]
    assert [item["id"] for item in reports] == [owner_review.json()["data"]["id"]]
    assert reports[0]["createdAt"]
    assert reports[0]["jobId"] == owner_job.json()["data"]["id"]


async def test_review_regenerate_creates_new_report_from_same_context(
    api_client: AsyncClient,
) -> None:
    headers = await register_headers(api_client, "regenerate@example.com")
    spec_id = await create_owned_spec(api_client, headers)
    job_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "codex", "specId": spec_id},
    )
    job_id = job_response.json()["data"]["id"]
    created = await api_client.post("/api/v1/reviews", headers=headers, json={"jobId": job_id})
    review_id = created.json()["data"]["id"]

    regenerated = await api_client.post(
        f"/api/v1/reviews/{review_id}/regenerate",
        headers=headers,
        json={},
    )

    assert regenerated.status_code == 200
    new_report = regenerated.json()["data"]
    assert new_report["id"] != review_id
    assert new_report["jobId"] == job_id
    assert new_report["specId"] == spec_id


async def test_review_optimize_creates_source_review_job_for_desktop_runner(
    api_client: AsyncClient,
) -> None:
    headers = await register_headers(api_client, "optimize@example.com")
    spec_id = await create_owned_spec(api_client, headers)
    job_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "codex", "specId": spec_id},
    )
    job_id = job_response.json()["data"]["id"]
    await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/events",
        headers=headers,
        json={"phase": "tests", "message": "pytest missing retry coverage", "progress": 60},
    )
    created = await api_client.post("/api/v1/reviews", headers=headers, json={"jobId": job_id})
    review_id = created.json()["data"]["id"]

    optimize = await api_client.post(
        f"/api/v1/reviews/{review_id}/optimize",
        headers=headers,
        json={},
    )

    assert optimize.status_code == 200
    optimized_source = optimize.json()["data"]
    optimization_job = optimized_source["optimizationJob"]
    assert optimization_job["sourceReviewId"] == review_id
    assert optimization_job["status"] == "queued"

    list_response = await api_client.get("/api/v1/reviews", headers=headers)
    reports = list_response.json()["data"]
    assert len(reports) == 1
    assert reports[0]["id"] == review_id
    assert reports[0]["optimizationJob"]["id"] == optimization_job["id"]

    events_response = await api_client.get(
        f"/api/v1/dev-jobs/{optimization_job['id']}/events",
        headers=headers,
    )
    assert "等待桌面端本机 Runner 执行" in events_response.text
    assert "sourceReviewId" in events_response.text


async def test_review_rejects_other_users_spec(api_client: AsyncClient) -> None:
    owner = await register_headers(api_client, "owner@example.com")
    requirement_response = await api_client.post(
        "/api/v1/requirements",
        headers=owner,
        json={"title": "客服 Agent", "initialMessage": "做一个处理售后退款的客服 agent"},
    )
    requirement_id = requirement_response.json()["data"]["id"]
    spec_response = await api_client.post(
        f"/api/v1/requirements/{requirement_id}/spec/generate", headers=owner
    )
    spec_id = spec_response.json()["data"]["id"]

    attacker = await register_headers(api_client, "attacker@example.com")
    response = await api_client.post(
        "/api/v1/reviews", headers=attacker, json={"specId": spec_id}
    )
    assert response.status_code == 404
