import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict
from .providers import MockGenerationProvider

app = FastAPI(title="Avala Creator Render Worker", version="0.0.1")

class ExecuteJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: str
    input_path: str

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "provider_mode": os.getenv("CREATOR_PROVIDER_MODE", "mock")}

@app.post("/v1/jobs/execute")
def execute_job(payload: ExecuteJobRequest, x_worker_token: str | None = Header(default=None)) -> dict[str, object]:
    expected = os.getenv("CREATOR_WORKER_TOKEN")
    if not expected or x_worker_token != expected:
        raise HTTPException(status_code=401, detail="worker authorization failed")
    mode = os.getenv("CREATOR_PROVIDER_MODE", "mock")
    if mode != "mock":
        raise HTTPException(status_code=503, detail="real provider is not configured")
    artifact = MockGenerationProvider().generate(job_id=payload.job_id, input_path=payload.input_path)
    return {
        "artifact": artifact.__dict__,
        "warning": "synthetic_mock: no voice, avatar, or video inference was performed"
    }
