from fastapi.testclient import TestClient

from app.main import app


def test_health_check() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["data"]["status"] == "ok"
    assert payload["data"]["service"] == "agentpro-api"
    assert payload["data"]["contractVersion"] >= 2
    assert payload["data"]["minDesktopContractVersion"] <= 2
    assert "runner.artifact.delivery-manifest.v1" in payload["data"]["capabilities"]
    assert "review.delivery-manifest-payload.v1" in payload["data"]["capabilities"]
