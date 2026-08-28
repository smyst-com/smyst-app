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
INGEST_CURSOR_KEY = "pipeline/ingest/cursor.json"
RESEARCH_PREFIX = "pipeline/research/"

#: Status-Marker: EIN leeres Objekt je Kandidat unter seinem aktuellen Status.
#: Grund (Messung 13.08.2026): candidate_documents_by_status lud vorher JEDES
#: Kandidaten-Dokument einzeln, nur um nach Status zu filtern — bei ~14.000
#: Kandidaten ~12 Minuten pro Aufruf, viermal pro Pipeline-Lauf, also ~48
#: Minuten reiner Leerlauf, linear wachsend. Mit Markern genuegt EIN
#: LIST-Aufruf je Status; geladen werden nur noch die Treffer.
#:
#: Ein eigener Schluessel je Kandidat (statt einer zentralen Index-Datei) ist
#: Absicht: die Worker-Stufen laufen seit 13.08. parallel, ein gemeinsames
#: Index-Objekt haette Lese-Aenderungs-Schreib-Kollisionen.
STATUS_PREFIX = "pipeline/status/"


class S3Like(Protocol):
    """Minimale boto3-Schnittstelle; erlaubt Fakes in Tests."""

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> Any: ...
    def get_object(self, *, Bucket: str, Key: str) -> Any: ...
    def get_paginator(self, name: str) -> Any: ...
    # Nur fuer die Status-Marker; Fakes duerfen beides weglassen, die Aufrufer
    # fangen den AttributeError ab (Marker sind Hinweise, keine Wahrheit).
    def list_objects_v2(self, *, Bucket: str, Prefix: str, MaxKeys: int) -> Any: ...
    def delete_object(self, *, Bucket: str, Key: str) -> Any: ...


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
        """Alle bereits gespeicherten QIDs (Dedup-Grundlage).

        published QIDs muessen hier DRIN bleiben (Revert 28.08.2026): Ohne sie
        akzeptiert der Ingest bereits live geschaltete Personen erneut,
        ueberschreibt deren Kandidaten-Dokument (Status-Rueckfall candidate)
        und erzeugt Doppel-Kapseln. Nachschub kommt ueber den Cursor-Mechanismus
        (Erschoepfung -> zurueck auf Seite 0; Dedup macht Wiederholung billig),
        nicht ueber Re-Ingest von Published.
        """
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
        # Neuer Kandidat: es gibt noch keinen alten Marker wegzuraeumen.
        self.write_status_marker(candidate.wikidata_qid, candidate.status.value)
        return key

    def load_candidate_document(self, qid: str) -> dict:
        response = self._client.get_object(Bucket=self._bucket, Key=f"{CANDIDATE_PREFIX}{qid}.json")
        return json.loads(response["Body"].read().decode("utf-8"))

    def save_candidate_document(
        self, qid: str, document: dict, *, previous_status: str | None = None
    ) -> str:
        """Aktualisiertes Kandidaten-Dokument (inkl. Audit-Trail) schreiben.

        previous_status raeumt den alten Status-Marker weg. Ohne die Angabe
        bleibt er stehen und kostet beim naechsten Lauf einen ueberfluessigen
        GET — der Statusabgleich beim Laden faengt ihn ab.
        """
        key = f"{CANDIDATE_PREFIX}{qid}.json"
        body = json.dumps(document, default=_json_default, ensure_ascii=False, indent=2).encode(
            "utf-8"
        )
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=body, ContentType="application/json"
        )
        status = document.get("status")
        if isinstance(status, str) and status:
            self.write_status_marker(qid, status, previous_status=previous_status)
        return key

    def _status_index_present(self) -> bool:
        """Gibt es ueberhaupt Status-Marker? (ein LIST-Aufruf, MaxKeys=1)

        Solange der Bestand nicht einmal indiziert wurde (Worker
        backfill_status_index), arbeitet candidate_documents_by_status wie
        frueher weiter. So kann die Umstellung keinen Lauf leerlaufen lassen.
        """
        try:
            response = self._client.list_objects_v2(
                Bucket=self._bucket, Prefix=STATUS_PREFIX, MaxKeys=1
            )
        except Exception:
            return False
        return bool(response.get("Contents"))

    def qids_by_status(self, status: str) -> list[str]:
        """QIDs laut Status-Marker — EIN LIST-Aufruf statt zehntausender GETs."""
        prefix = f"{STATUS_PREFIX}{status}/"
        qids: list[str] = []
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []) or []:
                qid = obj["Key"][len(prefix):]
                if qid:
                    qids.append(qid)
        return sorted(qids)

    def write_status_marker(self, qid: str, status: str, *, previous_status: str | None = None) -> None:
        """Setzt den Marker auf den neuen Status und raeumt den alten weg.

        Wirft NIE: der Marker ist ein HINWEIS, keine Wahrheit. Beim Laden wird
        der Status im Dokument geprueft — ein fehlender oder veralteter Marker
        kostet hoechstens einen ueberfluessigen GET, verfaelscht aber nichts.
        """
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=f"{STATUS_PREFIX}{status}/{qid}",
                Body=b"",
                ContentType="text/plain",
            )
        except Exception:
            return
        if previous_status and previous_status != status:
            try:
                self._client.delete_object(
                    Bucket=self._bucket, Key=f"{STATUS_PREFIX}{previous_status}/{qid}"
                )
            except Exception:
                pass  # veralteter Marker kostet nur einen GET, siehe Docstring

    def candidate_documents_by_status(self, status: str, *, limit: int | None = None) -> list[dict]:
        """Alle Kandidaten-Dokumente mit gegebenem Status.

        Schneller Weg ueber die Status-Marker; ohne Marker (vor dem einmaligen
        Backfill) der alte Voll-Scan.
        """
        documents: list[dict] = []
        fast_path = self._status_index_present()
        qids = self.qids_by_status(status) if fast_path else sorted(self.existing_qids())
        for qid in qids:
            try:
                document = self.load_candidate_document(qid)
            except Exception:
                continue  # geloeschtes Dokument mit verwaistem Marker
            if document.get("status") != status:
                continue  # veralteter Marker — Dokument entscheidet
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

    def load_ingest_cursor(self) -> dict:
        """OFFSET-Cursor je Kategorie (Seiten-Fortschritt ueber Laeufe hinweg).

        Fehlender Schluessel = Erstlauf -> leerer Cursor. Bewusst breit
        gefangen: jeder Lesefehler faellt auf 'von vorn blaettern' zurueck,
        der Ingest bleibt dadurch immer lauffaehig.
        """
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=INGEST_CURSOR_KEY)
            data = json.loads(response["Body"].read().decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def save_ingest_cursor(self, cursor: dict) -> str:
        body = json.dumps(cursor, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        self._client.put_object(
            Bucket=self._bucket, Key=INGEST_CURSOR_KEY, Body=body, ContentType="application/json"
        )
        return INGEST_CURSOR_KEY

    def save_changelog(self, run_date: date, report: dict, *, suffix: str = "") -> str:
        """Tagesbericht: reproduzierbar, prueffaehig (Master Prompt).

        suffix (z. B. "-seed") verhindert, dass Sonderlaeufe den taeglichen
        Ingest-Bericht desselben Tages ueberschreiben.
        """
        key = f"{CHANGELOG_PREFIX}{run_date.isoformat()}{suffix}.json"
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
