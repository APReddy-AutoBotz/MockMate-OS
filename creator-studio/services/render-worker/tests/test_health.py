from uuid import UUID

from fastapi.testclient import TestClient

from creator_worker.main import app

client = TestClient(app)
JOB_ID = "11111111-1111-1111-1111-111111111111"
ARTIFACT_ID = "22222222-2222-2222-2222-222222222222"


def request_body() -> dict[str, str]:
    return {
        "job_id": JOB_ID,
        "input_artifact_id": ARTIFACT_ID,
        "input_path": "private/projects/source.txt",
        "artifact_kind": "voice",
    }


def test_health_is_explicitly_mock_in_development(monkeypatch) -> None:
    monkeypatch.setenv("CREATOR_RUNTIME_MODE", "development")
    monkeypatch.setenv("CREATOR_PROVIDER_MODE", "mock")
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "runtime_mode": "development",
        "provider_mode": "mock",
        "ready": True,
    }


def test_execute_fails_without_worker_token(monkeypatch) -> None:
    monkeypatch.delenv("CREATOR_WORKER_TOKEN", raising=False)
    response = client.post("/v1/jobs/execute", json=request_body())
    assert response.status_code == 401


def test_mock_generation_is_deterministic_and_labelled(monkeypatch) -> None:
    monkeypatch.setenv("CREATOR_RUNTIME_MODE", "test")
    monkeypatch.setenv("CREATOR_PROVIDER_MODE", "mock")
    monkeypatch.setenv("CREATOR_WORKER_TOKEN", "test-secret")
    response = client.post(
        "/v1/jobs/execute",
        headers={"x-worker-token": "test-secret"},
        json=request_body(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["artifact"]["kind"] == "voice"
    assert body["artifact"]["is_mock"] is True
    assert body["warning"].startswith("synthetic_mock")
    UUID(JOB_ID)


def test_mock_generation_is_blocked_in_preview(monkeypatch) -> None:
    monkeypatch.setenv("CREATOR_RUNTIME_MODE", "preview")
    monkeypatch.setenv("CREATOR_PROVIDER_MODE", "mock")
    monkeypatch.setenv("CREATOR_WORKER_TOKEN", "test-secret")
    response = client.post(
        "/v1/jobs/execute",
        headers={"x-worker-token": "test-secret"},
        json=request_body(),
    )
    assert response.status_code == 503


def test_path_traversal_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("CREATOR_WORKER_TOKEN", "test-secret")
    body = request_body()
    body["input_path"] = "private/../secret"
    response = client.post(
        "/v1/jobs/execute",
        headers={"x-worker-token": "test-secret"},
        json=body,
    )
    assert response.status_code == 422
