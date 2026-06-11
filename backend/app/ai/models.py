from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from hashlib import sha256
from typing import Any
from uuid import UUID, uuid4


class ContentType(str, Enum):
    TEXT = "text"
    DOCUMENT = "document"
    PDF = "pdf"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


class Sensitivity(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    SENSITIVE = "sensitive"
    HIGHLY_SENSITIVE = "highly_sensitive"


class ModerationDecision(str, Enum):
    ALLOW = "allow"
    WARN = "warn"
    BLOCK = "block"


class JobStatus(str, Enum):
    REQUESTED = "requested"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass(frozen=True)
class UploadedAsset:
    user_id: UUID
    twin_id: UUID
    filename: str
    mime_type: str
    content: bytes
    upload_id: UUID = field(default_factory=uuid4)
    storage_key: str | None = None
    checksum_sha256: str = ""
    status: JobStatus = JobStatus.REQUESTED
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def with_checksum(self) -> "UploadedAsset":
        checksum = sha256(self.content).hexdigest()
        storage_key = self.storage_key or f"users/{self.user_id}/twins/{self.twin_id}/uploads/{self.upload_id}/original"
        return UploadedAsset(
            user_id=self.user_id,
            twin_id=self.twin_id,
            filename=self.filename,
            mime_type=self.mime_type,
            content=self.content,
            upload_id=self.upload_id,
            storage_key=storage_key,
            checksum_sha256=checksum,
            status=JobStatus.PROCESSING,
            created_at=self.created_at,
        )


@dataclass(frozen=True)
class ParsedDocument:
    upload_id: UUID
    twin_id: UUID
    content_type: ContentType
    text: str
    language: str = "unknown"
    sensitivity: Sensitivity = Sensitivity.PRIVATE
    metadata: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class MemoryChunk:
    twin_id: UUID
    source_upload_id: UUID
    content: str
    chunk_index: int
    sensitivity: Sensitivity
    metadata: dict[str, Any] = field(default_factory=dict)
    chunk_id: UUID = field(default_factory=uuid4)
    content_hash: str = ""
    token_count: int = 0

    def normalized(self) -> "MemoryChunk":
        content_hash = sha256(self.content.encode("utf-8")).hexdigest()
        token_count = len(self.content.split())
        return MemoryChunk(
            twin_id=self.twin_id,
            source_upload_id=self.source_upload_id,
            content=self.content,
            chunk_index=self.chunk_index,
            sensitivity=self.sensitivity,
            metadata=self.metadata,
            chunk_id=self.chunk_id,
            content_hash=content_hash,
            token_count=token_count,
        )


@dataclass(frozen=True)
class EmbeddingRecord:
    twin_id: UUID
    chunk_id: UUID
    vector: list[float]
    embedding_model: str
    sensitivity: Sensitivity
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SearchResult:
    chunk: MemoryChunk
    score: float


@dataclass(frozen=True)
class MemoryFact:
    twin_id: UUID
    content: str
    fact_type: str
    confidence_score: float
    sensitivity: Sensitivity
    source_chunk_ids: list[UUID]
    metadata: dict[str, Any] = field(default_factory=dict)
    fact_id: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class PersonaProfile:
    twin_id: UUID
    persona_summary: str
    communication_style: dict[str, Any]
    values_profile: dict[str, Any]
    safety_boundaries: dict[str, Any]
    confidence_score: float
    source_fact_ids: list[UUID]
    built_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class TwinVersion:
    twin_id: UUID
    version_id: UUID
    version_number: int
    persona_profile: PersonaProfile
    memory_fact_ids: list[UUID]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModerationResult:
    decision: ModerationDecision
    categories: list[str]
    reason: str

    @property
    def allowed(self) -> bool:
        return self.decision != ModerationDecision.BLOCK


@dataclass(frozen=True)
class LLMRequest:
    prompt: str
    system_prompt: str
    max_tokens: int = 800
    temperature: float = 0.2
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMResponse:
    text: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    degraded: bool = False


@dataclass(frozen=True)
class RagAnswer:
    answer: str
    citations: list[SearchResult]
    moderation: ModerationResult
    provider: str
    model: str
    degraded: bool


@dataclass(frozen=True)
class PipelineResult:
    upload: UploadedAsset
    parsed: ParsedDocument
    chunks: list[MemoryChunk]
    embeddings: list[EmbeddingRecord]
    facts: list[MemoryFact]
    persona: PersonaProfile
    twin_version: TwinVersion

