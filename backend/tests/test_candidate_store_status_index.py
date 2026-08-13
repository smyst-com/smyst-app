"""Tests fuer die Status-Marker im CandidateStore.

Hintergrund (Messung 13.08.2026): candidate_documents_by_status lud JEDES
Kandidaten-Dokument einzeln, nur um nach Status zu filtern — bei ~14.000
Kandidaten ~12 Minuten pro Aufruf und viermal pro Pipeline-Lauf. Belegt durch
Laeufe, in denen die Stufen `{"results": 0, "errors": 0}` meldeten und trotzdem
12 Minuten brauchten.

Diese Tests sichern den schnellen Weg ab — vor allem die Faelle, in denen ein
Marker LUEGT: veraltet, verwaist oder gar nicht vorhanden.
"""

from __future__ import annotations

import json

import pytest

from app.integrations.candidate_store import (
    CANDIDATE_PREFIX,
    STATUS_PREFIX,
    CandidateStore,
)


class FakeS3:
    """S3-Fake mit LIST/DELETE — das Original hat nur put/get/paginator."""

    def __init__(self, *, supports_delete: bool = True, supports_list: bool = True) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.reads: list[str] = []
        self._supports_delete = supports_delete
        self._supports_list = supports_list

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str):
        self.objects[Key] = Body
        return {}

    def get_object(self, *, Bucket: str, Key: str):
        self.reads.append(Key)
        if Key not in self.objects:
            raise KeyError(Key)

        class Body:
            def __init__(self, data: bytes) -> None:
                self._data = data

            def read(self) -> bytes:
                return self._data

        return {"Body": Body(self.objects[Key])}

    def _contents(self, prefix: str) -> list[dict]:
        return [{"Key": key} for key in sorted(self.objects) if key.startswith(prefix)]

    def list_objects_v2(self, *, Bucket: str, Prefix: str, MaxKeys: int = 1000):
        if not self._supports_list:
            raise AttributeError("list_objects_v2")
        return {"Contents": self._contents(Prefix)[:MaxKeys]}

    def delete_object(self, *, Bucket: str, Key: str):
        if not self._supports_delete:
            raise AttributeError("delete_object")
        self.deleted.append(Key)
        self.objects.pop(Key, None)
        return {}

    def get_paginator(self, name: str):
        fake = self

        class Paginator:
            def paginate(self, *, Bucket: str, Prefix: str):
                yield {"Contents": fake._contents(Prefix)}

        return Paginator()


def _store(**kwargs) -> tuple[CandidateStore, FakeS3]:
    client = FakeS3(**kwargs)
    return CandidateStore(client, "smyst-memories"), client


def _put_document(client: FakeS3, qid: str, status: str) -> None:
    client.objects[f"{CANDIDATE_PREFIX}{qid}.json"] = json.dumps(
        {"wikidata_qid": qid, "status": status}
    ).encode()


def test_saving_writes_marker_and_removes_the_old_one() -> None:
    store, client = _store()
    store.save_candidate_document("Q1", {"wikidata_qid": "Q1", "status": "researched"},
                                  previous_status="candidate")
    assert f"{STATUS_PREFIX}researched/Q1" in client.objects
    assert f"{STATUS_PREFIX}candidate/Q1" in client.deleted


def test_fast_path_reads_only_the_matching_documents() -> None:
    """Der eigentliche Zweck: NICHT mehr jedes Dokument laden."""
    store, client = _store()
    for index in range(50):
        _put_document(client, f"Q{index}", "published")
    _put_document(client, "Q999", "reviewed")
    store.write_status_marker("Q999", "reviewed")

    client.reads.clear()
    documents = store.candidate_documents_by_status("reviewed")

    assert [document["wikidata_qid"] for document in documents] == ["Q999"]
    assert len(client.reads) == 1, "es wurden fremde Dokumente geladen"


def test_stale_marker_loses_against_the_document() -> None:
    """Marker sind Hinweise. Steht im Dokument etwas anderes, gilt das Dokument."""
    store, client = _store()
    _put_document(client, "Q1", "published")
    store.write_status_marker("Q1", "reviewed")  # veraltet
    assert store.candidate_documents_by_status("reviewed") == []


def test_orphan_marker_without_document_is_skipped() -> None:
    store, client = _store()
    store.write_status_marker("Q404", "reviewed")
    _put_document(client, "Q1", "reviewed")
    store.write_status_marker("Q1", "reviewed")
    documents = store.candidate_documents_by_status("reviewed")
    assert [document["wikidata_qid"] for document in documents] == ["Q1"]


def test_without_markers_the_old_full_scan_still_works() -> None:
    """Migrationsschutz: vor dem Backfill darf kein Lauf leerlaufen."""
    store, client = _store(supports_list=False)
    _put_document(client, "Q1", "reviewed")
    _put_document(client, "Q2", "published")
    documents = store.candidate_documents_by_status("reviewed")
    assert [document["wikidata_qid"] for document in documents] == ["Q1"]


def test_limit_is_respected_on_the_fast_path() -> None:
    store, client = _store()
    for index in range(5):
        _put_document(client, f"Q{index}", "reviewed")
        store.write_status_marker(f"Q{index}", "reviewed")
    assert len(store.candidate_documents_by_status("reviewed", limit=2)) == 2


def test_marker_write_never_raises_without_delete_support() -> None:
    """Ein Client ohne delete_object darf den Pipeline-Lauf nicht sprengen."""
    store, client = _store(supports_delete=False)
    store.write_status_marker("Q1", "reviewed", previous_status="candidate")
    assert f"{STATUS_PREFIX}reviewed/Q1" in client.objects


def test_qids_by_status_lists_only_that_status() -> None:
    store, client = _store()
    store.write_status_marker("Q1", "reviewed")
    store.write_status_marker("Q2", "reviewed")
    store.write_status_marker("Q3", "published")
    assert store.qids_by_status("reviewed") == ["Q1", "Q2"]
    assert store.qids_by_status("published") == ["Q3"]


@pytest.mark.parametrize("status", ["", None, 123])
def test_document_without_usable_status_writes_no_marker(status) -> None:
    store, client = _store()
    store.save_candidate_document("Q1", {"wikidata_qid": "Q1", "status": status})
    assert not [key for key in client.objects if key.startswith(STATUS_PREFIX)]
