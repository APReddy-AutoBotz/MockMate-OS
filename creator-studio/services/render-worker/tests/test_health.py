from fastapi.testclient import TestClient
from creator_worker.main import app

client = TestClient(app)

def test_health_is_explicitly_mock_by_default() -> None:
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'provider_mode': 'mock'}

def test_execute_fails_without_worker_token() -> None:
    response = client.post('/v1/jobs/execute', json={'job_id': 'job-1', 'input_path': 'private/input'})
    assert response.status_code == 401
