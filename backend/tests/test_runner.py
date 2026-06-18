from httpx import AsyncClient

from app.core.config import get_settings


async def runner_auth_headers(client: AsyncClient) -> dict[str, str]:
    code_response = await client.post(
        "/api/v1/auth/email-code", json={"email": "runner@example.com"}
    )
    code = code_response.json()["data"]["debugCode"]
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "runner@example.com",
            "code": code,
            "password": "Password123",
            "name": "Runner User",
        },
    )
    token = register_response.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def test_runner_job_lease_event_and_artifact(api_client: AsyncClient) -> None:
    headers = await runner_auth_headers(api_client)

    create_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "parallel", "specId": "spec_001"},
    )
    assert create_response.status_code == 200
    job = create_response.json()["data"]
    assert job["engines"] == ["codex", "claude-code"]
    assert job["status"] == "queued"

    lease_response = await api_client.post(
        f"/api/v1/dev-jobs/{job['id']}/lease",
        headers=headers,
        json={"runnerId": "desktop-local"},
    )
    assert lease_response.status_code == 200
    assert lease_response.json()["data"]["leased"] is True

    event_response = await api_client.post(
        f"/api/v1/dev-jobs/{job['id']}/events",
        headers=headers,
        json={
            "phase": "typecheck",
            "message": "npm run typecheck passed",
            "progress": 45,
            "status": "running",
        },
    )
    assert event_response.status_code == 200
    assert event_response.json()["data"]["progress"] == 45

    artifact_response = await api_client.post(
        f"/api/v1/dev-jobs/{job['id']}/artifacts",
        headers=headers,
        json={
            "engine": "codex",
            "kind": "diff-summary",
            "summary": "完成候选实现",
            "payload": {"commit": "abc123"},
        },
    )
    assert artifact_response.status_code == 200
    assert artifact_response.json()["data"]["engine"] == "codex"

    events_response = await api_client.get(f"/api/v1/dev-jobs/{job['id']}/events", headers=headers)
    assert events_response.status_code == 200
    assert events_response.json()["data"][0]["phase"] == "typecheck"

    stream_response = await api_client.get(f"/api/v1/dev-jobs/{job['id']}/stream", headers=headers)
    assert stream_response.status_code == 200
    assert "event: snapshot" in stream_response.text
    assert "event: log" in stream_response.text
    assert "event: heartbeat" in stream_response.text


async def test_runner_execute_records_unavailable_engine(
    api_client: AsyncClient,
    monkeypatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    monkeypatch.setenv("AGENTPRO_RUNNER_EXECUTION_ENABLED", "true")
    headers = await runner_auth_headers(api_client)
    create_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "claude-code", "specId": "spec_missing_cli"},
    )
    job_id = create_response.json()["data"]["id"]

    execute_response = await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/execute",
        headers=headers,
        json={},
    )

    assert execute_response.status_code == 200
    job = execute_response.json()["data"]
    assert job["status"] == "failed"
    assert job["progress"] == 100

    events_response = await api_client.get(f"/api/v1/dev-jobs/{job_id}/events", headers=headers)
    messages = [item["message"] for item in events_response.json()["data"]]
    assert any("CLI 未安装" in message for message in messages)


async def test_runner_execute_invokes_available_cli(
    api_client: AsyncClient,
    monkeypatch,
    tmp_path,
) -> None:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_codex = fake_bin / "codex"
    fake_codex.write_text(
        "#!/bin/sh\n"
        "printf 'fake codex received %s\\n' \"$*\"\n"
        "printf '\\nrunner touched README\\n' >> README.md\n",
        encoding="utf-8",
    )
    fake_codex.chmod(0o755)

    current_path = "/usr/bin:/bin"
    monkeypatch.setenv("PATH", f"{fake_bin}:{current_path}")
    monkeypatch.setenv("AGENTPRO_RUNNER_EXECUTION_ENABLED", "true")
    monkeypatch.setenv("AGENTPRO_RUNNER_WORKSPACE_ROOT", str(tmp_path / "runs"))
    get_settings.cache_clear()

    headers = await runner_auth_headers(api_client)
    create_response = await api_client.post(
        "/api/v1/dev-jobs",
        headers=headers,
        json={"strategy": "codex", "specId": "spec_fake_cli"},
    )
    job_id = create_response.json()["data"]["id"]

    execute_response = await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/execute",
        headers=headers,
        json={},
    )

    assert execute_response.status_code == 200
    job = execute_response.json()["data"]
    assert job["status"] == "completed"
    assert job["progress"] == 100

    artifact_response = await api_client.post(
        f"/api/v1/dev-jobs/{job_id}/artifacts",
        headers=headers,
        json={
            "engine": "codex",
            "kind": "manual-note",
            "summary": "artifact endpoint remains compatible",
            "payload": {},
        },
    )
    assert artifact_response.status_code == 200

    stream_response = await api_client.get(f"/api/v1/dev-jobs/{job_id}/stream", headers=headers)
    assert "fake codex" in stream_response.text or "执行完成" in stream_response.text
