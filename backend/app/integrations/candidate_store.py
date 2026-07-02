"""IDrive-e2-Store fuer Pipeline-Kandidaten (JSON, S3-kompatibel).

Architektur-Entscheidung 2026-07-02 (mit Nutzer abgestimmt): Der Pipeline-
Status wird in der Free-only-Produktion als JSON-Objekte in IDrivee2.com
gefuehrt; das PostgreSQL-Schema (Migration 0007) bleibt Domain-Referenz und
Migrationsziel. Spaeterer Umstieg: Objekte 1:1 in historical_candidates laden.

Layout im Bucket:
  pipeline/candidates/{qid}.json   ein Objekt pro Kandidat (Status + Audit-Trail)
  pipeline/changelogs/{datum}.json Tagesbericht des Ingest-Laufs

Konsistenzmodell: genau EIN Schreiber (der taegliche Salad-Cronjob).
Objektname = QID -> Dedup ueber Schluessel-Existenz. Kein verteiltes Locking
noetig; sollte spaeter parallel geschrieben werden, ist der Umstieg auf
Postgres (Migration 0007) Pflicht.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import date, datetime
from typing import Any, Protocol
from uuid import UUID

from app.ai.historical_pipeline import AuditEvent, HistoricalCandidate

CANDIDATE_PREFIX = "pipeline/candidates/"
CHANGELOG_PREFIX = "pipeline/changelogs/"
SOURCE_PREFIX = "pipeline/sources/"
RESEARCH_PREFIX = "pipeline/research/"


class S3Like(Protocol):
    """Minimale boto3-Schnittstelle; erlaubt Fakes in Tests."""

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> Any: ...
    def get_object(self, *, Bucket: str, Key: str) -> Any: ...
    def get_paginator(self, name: str) -> Any: ...


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"nicht serialisierbar: {type(value)!r}")


def candidate_document(
    candidate: HistoricalCandidate, events: list[AuditEvent] | None = None
) -> dict:
    """Serialisierbares Kandidaten-Dokument inkl. Audit-Trail (replaybar)."""
    doc = asdict(candidate)
    doc["status"] = candidate.status.value
    doc["audit_trail"] = [
        {**asdict(event), "from_status": event.from_status.value, "to_status": event.to_status.value}
        for event in (events or [])
    ]
    return doc


class CandidateStore:
    def __init__(self, client: S3Like, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def existing_qids(self) -> set[str]:
        """Alle bereits gespeicherten QIDs (Dedup-Grundlage)."""
        qids: set[str] = set()
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=CANDIDATE_PREFIX):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith(".json"):
                    qids.add(key[len(CANDIDATE_PREFIX):-len(".json")])
        return qids

    def save_candidate(
        self, candidate: HistoricalCandidate, events: list[AuditEvent] | None = None
    ) -> str:
        key = f"{CANDIDATE_PREFIX}{candidate.wikidata_qid}.json"
        body = json.dumps(
            candidate_document(candidate, events),
            default=_json_default,
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=body, ContentType="application/json"
        )
        return key

    def load_candidate_document(self, qid: str) -> dict:
        response = self._client.get_object(Bucket=self._bucket, Key=f"{CANDIDATE_PREFIX}{qid}.json")
        return json.loads(response["Body"].read().decode("utf-8"))

    def save_candidate_document(self, qid: str, document: dict) -> str:
        """Aktualisiertes Kandidaten-Dokument (inkl. Audit-Trail) schreiben."""
        key = f"{CANDIDATE_PREFIX}{qid}.json"
        body = json.dumps(document, default=_json_default, ensure_ascii=False, indent=2).encode(
            "utf-8"
        )
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=body, ContentType="application/json"
        )
        return key

    def candidate_documents_by_status(self, status: str, *, limit: int | None = None) -> list[dict]:
        """Alle Kandidaten-Dokumente mit gegebenem Status (Scan; geringes Volumen)."""
        documents: list[dict] = []
        for qid in sorted(self.existing_qids()):
            document = self.load_candidate_document(qid)
            if document.get("status") == status:
                documents.append(document)
                if limit is not None and len(documents) >= limit:
                    break
        return documents

    def save_source_snapshot(
        self, qid: str, filename: str, content: bytes, *, content_type: str = "application/json"
    ) -> str:
        """Quellen-Snapshot: reproduzierbar und prueffaehig (Master Prompt)."""
        key = f"{SOURCE_PREFIX}{qid}/{filename}"
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=content, ContentType=content_type
        )
        return key

    def save_research_document(self, qid: str, document: dict) -> str:
        key = f"{RESEARCH_PREFIX}{qid}.json"
        body = json.dumps(document, default=_json_default, ensure_ascii=False, indent=2).encode(
            "utf-8"
        )
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=body, ContentType="application/json"
        )
        return key

    def save_changelog(self, run_date: date, report: dict) -> str:
        """Tagesbericht: reproduzierbar, prueffaehig (Master Prompt)."""
        key = f"{CHANGELOG_PREFIX}{run_date.isoformat()}.json"
        body = json.dumps(report, default=_json_default, ensure_ascii=False, indent=2).encode(
            "utf-8"
        )
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=body, ContentType="application/json"
        )
        return key


def build_s3_client():  # pragma: no cover - reine Verdrahtung
    """boto3-Client fuer IDrivee2.com aus den bestehenden Settings."""
    import boto3

    from app.core.config import settings

    return boto3.client(
        "s3",
        endpoint_url=settings.idrive_e2_endpoint,
        region_name=settings.idrive_e2_region,
        aws_access_key_id=settings.idrive_e2_access_key,
        aws_secret_access_key=settings.idrive_e2_secret_key,
    )
