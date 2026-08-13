from dataclasses import dataclass
from typing import Literal, Protocol

ArtifactKind = Literal["script", "voice", "avatar", "edit", "final"]

@dataclass(frozen=True)
class GeneratedArtifact:
    kind: ArtifactKind
    storage_path: str
    sha256: str
    provider: str
    is_mock: bool

class GenerationProvider(Protocol):
    name: str
    def generate(self, *, job_id: str, input_path: str) -> GeneratedArtifact: ...

class ProviderUnavailable(RuntimeError):
    code = "PROVIDER_UNAVAILABLE"

class MockGenerationProvider:
    name = "mock"

    def generate(self, *, job_id: str, input_path: str) -> GeneratedArtifact:
        # Deliberately deterministic placeholder metadata. It is never a real media result.
        import hashlib
        digest = hashlib.sha256(f"mock:{job_id}:{input_path}".encode()).hexdigest()
        return GeneratedArtifact(
            kind="voice",
            storage_path=f"mock/{job_id}.json",
            sha256=digest,
            provider=self.name,
            is_mock=True,
        )
