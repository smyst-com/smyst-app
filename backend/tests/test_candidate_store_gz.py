"""Tests fuer Egress-Sparer und Egress-Zaehler im CandidateStore.

Hintergrund (Vorfall 14.10.2026): IDrive e2 sperrte das komplette Konto,
 weil Egress-Gebuehren (37,65 USD) nicht abgebucht wurden — 8+ Tage lang
 standen 0 Profile/Tag im Autopilot. Haupttreiber waren Wiederholungsleser
 des ~245-MiB-Klartext-Publish-Index (Profil-Doktor stuendlich, Publish-
 Laeufe, Pages-Deploys, taegliches Backup).

Diese Tests sichern die Gegenmassnahmen ab:
  - save_json_with_gz legt Klartext UND .gz-Zwilling ab (alte Leser laufen weiter)
  - load_json_prefer_gz zieht die .gz-Variante und faellt nur bei FEHLENDER
    .gz-Variante auf Klartext zurueck (kein stiller Fallback bei Netz/Rechte)
  - der Egress-Zaehler zaehlt Wire-Bytes und landet best effort in e2
"""

from __future__ import annotations

import gzip
import json
from datetime import date

import pytest

from app.integrations.candidate_store import (
    EGRESS_METRICS_PREFIX,
    EGRESS_TALLY,
    CandidateStore,
)


class FakeS3:
    """Minimal-Fake: put/get mit KeyError fuer fehlende Schluessel."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.reads: list[str] = []
        self.put_gesperrt = False  # True = put_object wirft (Metering-Test)

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str):
        if self.put_gesperrt:
            raise RuntimeError("put gesperrt")
        self.objects[Key] = Body
        return {}

    def get_object(self, *, Bucket: str, Key: str):
        self.reads.append(Key)
        if Key not in self.objects:
            raise KeyError(Key)

        class Body:
            def __init__(self, daten: bytes) -> None:
                self._daten = daten

            def read(self) -> bytes:
                return self._daten

        return {"Body": Body(self.objects[Key])}


@pytest.fixture()
def store() -> CandidateStore:
    EGRESS_TALLY.clear()
    return CandidateStore(FakeS3(), "smyst-memories")


def test_save_json_with_gz_legt_beide_fassungen(store: CandidateStore) -> None:
    # Realistische Groessenordnung: viele aehnliche Eintraege, wie der echte
    # Publish-Index (~245 MiB Klartext bei ~96k Profilen). Mini-Payloads
    # komprimieren nicht (gzip-Header-Overhead) — die Assertion braucht Masse.
    payload = [
        {"wikidata_qid": f"Q{nummer}", "name": f"smyst Profil {nummer}", "slug": f"smyst-profil-{nummer}"}
        for nummer in range(500)
    ]
    store.save_json_with_gz("pipeline/published/index.json", payload)

    client = store._client
    assert "pipeline/published/index.json" in client.objects
    assert "pipeline/published/index.json.gz" in client.objects
    klar = json.loads(client.objects["pipeline/published/index.json"].decode("utf-8"))
    gz = json.loads(
        gzip.decompress(client.objects["pipeline/published/index.json.gz"]).decode("utf-8")
    )
    assert klar == gz == payload
    # Die .gz-Fassung muss spuerbar kleiner sein (der eigentliche Zweck).
    assert len(client.objects["pipeline/published/index.json.gz"]) < len(
        client.objects["pipeline/published/index.json"]
    )


def test_load_json_prefer_gz_zieht_die_gz_variante(store: CandidateStore) -> None:
    store.save_json_with_gz("pipeline/published/index.json", [{"qid": "Q1"}])
    store._client.reads.clear()

    ergebnis = store.load_json_prefer_gz("pipeline/published/index.json")

    assert ergebnis == [{"qid": "Q1"}]
    assert store._client.reads == ["pipeline/published/index.json.gz"]


def test_load_json_prefer_gz_faellt_zurueck_auf_klartext(store: CandidateStore) -> None:
    # Uebergangszeit: Schreiber hat noch keine .gz-Variante geschrieben.
    body = json.dumps([{"qid": "Q2"}], ensure_ascii=False).encode("utf-8")
    store._client.objects["pipeline/published/index.json"] = body

    ergebnis = store.load_json_prefer_gz("pipeline/published/index.json")

    assert ergebnis == [{"qid": "Q2"}]
    assert store._client.reads == [
        "pipeline/published/index.json.gz",
        "pipeline/published/index.json",
    ]


def test_load_json_prefer_gz_wirft_wenn_beide_fehlen(store: CandidateStore) -> None:
    with pytest.raises(KeyError):
        store.load_json_prefer_gz("pipeline/published/index.json")


def test_egress_tally_zaehlt_und_flushlegt_tagesobjekt(store: CandidateStore) -> None:
    store.save_json_with_gz("pipeline/published/index.json", ["x"])
    store._client.reads.clear()
    EGRESS_TALLY.clear()

    store.load_json_prefer_gz("pipeline/published/index.json")

    wire = len(store._client.objects["pipeline/published/index.json.gz"])
    assert EGRESS_TALLY == {"pipeline/published/index.json.gz": wire}

    store.flush_egress_tally("test-lauf")

    key = f"{EGRESS_METRICS_PREFIX}{date.today().isoformat()}.json"
    assert key in store._client.objects
    ablage = json.loads(store._client.objects[key].decode("utf-8"))
    assert ablage["runs"][-1]["source"] == "test-lauf"
    assert ablage["runs"][-1]["total_bytes"] == wire


def test_flush_egress_tally_haengt_an_und_uebersteht_schreibfehler(
    store: CandidateStore,
) -> None:
    EGRESS_TALLY.clear()
    heute_key = f"{EGRESS_METRICS_PREFIX}{date.today().isoformat()}.json"
    store._client.objects[heute_key] = json.dumps(
        {"month": "x", "runs": [{"source": "frueher", "total_bytes": 1}]}
    ).encode("utf-8")
    EGRESS_TALLY["irgend/key"] = 4711

    store.flush_egress_tally("test-lauf")  # haengt an den Bestand an
    ablage = json.loads(store._client.objects[heute_key].decode("utf-8"))
    assert [lauf["source"] for lauf in ablage["runs"]] == ["frueher", "test-lauf"]

    EGRESS_TALLY["noch/key"] = 8
    store._client.put_gesperrt = True
    store.flush_egress_tally("test-lauf-2")  # best effort: darf nie werfen
