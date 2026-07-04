import json
from datetime import date

from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig, RiskResult
from app.ai.risk_checks import (
    assess_risk,
    ethics_risk,
    evaluate_commons_license,
)
from app.integrations.candidate_store import CandidateStore

CONFIG = PipelineConfig(enabled=True)


def make_candidate(name="Charles Darwin", qid="Q1035", death=date(1882, 4, 19), **kw):
    return HistoricalCandidate(
        wikidata_qid=qid, name=name, death_date=death, category="Wissenschaft",
        sitelink_count=250, source_count=3, **kw,
    )


# --- Einzel-Checks ---

def test_ethics_watchlist_blocks_perpetrators_and_reviews_religious_figures() -> None:
    assert ethics_risk("Q352", "x")[0] is RiskResult.BLOCK          # Hitler
    assert ethics_risk(None, "Adolf  HITLER")[0] is RiskResult.BLOCK
    assert ethics_risk("Q9458", "x")[0] is RiskResult.BLOCK          # Mohammed
    assert ethics_risk("Q302", "x")[0] is RiskResult.MANUAL_REVIEW   # Jesus
    assert ethics_risk("Q1035", "Charles Darwin")[0] is RiskResult.PASS


def test_license_evaluation() -> None:
    assert evaluate_commons_license("Public domain") is RiskResult.PASS
    assert evaluate_commons_license("PD-US") is RiskResult.PASS
    assert evaluate_commons_license("CC0") is RiskResult.PASS
    assert evaluate_commons_license("CC BY-SA 4.0") is RiskResult.PASS
    assert evaluate_commons_license("Fair use") is RiskResult.BLOCK
    assert evaluate_commons_license(None) is RiskResult.MANUAL_REVIEW


# --- Aggregation ---

def test_clean_candidate_gets_low_score_and_commons_image() -> None:
    a = assess_risk(
        make_candidate(), config=CONFIG,
        image_commons_file="Darwin.jpg", image_license_short_name="Public domain",
    )
    assert not a.reject
    assert a.flags == {"works": "pass", "image": "pass", "publicity": "pass", "ethics": "pass"}
    assert a.score == 0.0
    assert a.image_status == "commons_ok"


def test_unfree_image_never_blocks_profile() -> None:
    a = assess_risk(
        make_candidate(), config=CONFIG,
        image_commons_file="Darwin.jpg", image_license_short_name="Fair use",
    )
    assert not a.reject
    assert a.image_status == "generated"
    assert a.flags["image"] == "restricted"
    assert any("KI-Portrait" in n for n in a.notes)


def test_missing_image_means_generated_portrait() -> None:
    a = assess_risk(make_candidate(), config=CONFIG,
                    image_commons_file=None, image_license_short_name=None)
    assert a.image_status == "generated" and not a.reject


def test_late_death_year_marks_works_restricted() -> None:
    a = assess_risk(
        make_candidate(name="Thomas Mann", qid="Q37030", death=date(1955, 8, 12)),
        config=CONFIG, image_commons_file=None, image_license_short_name=None,
    )
    assert a.flags["works"] == "pass"  # 1955 == Cutoff
    b = assess_risk(
        make_candidate(name="Albert Schweitzer", qid="Q23831", death=date(1965, 9, 4)),
        config=CONFIG, image_commons_file=None, image_license_short_name=None,
    )
    assert b.flags["works"] == "restricted" and not b.reject


def test_artist_death_after_1950_marks_works_restricted() -> None:
    # Rechtsanalyse 2026-07-04, 2.3: Kunst + Sterbejahr > 1950 -> works=restricted,
    # auch wenn der allgemeine max_death_year-Cutoff (1955) noch PASS ergaebe.
    artist = HistoricalCandidate(
        wikidata_qid="Q5589", name="Henri Matisse", death_date=date(1954, 11, 3),
        category="Kunst", sitelink_count=200, source_count=3,
    )
    a = assess_risk(artist, config=CONFIG,
                    image_commons_file=None, image_license_short_name=None)
    assert a.flags["works"] == "restricted" and not a.reject
    assert any("p.m.a." in n for n in a.notes)
    # Kunst mit Sterbejahr <= 1950 bleibt pass:
    early_artist = HistoricalCandidate(
        wikidata_qid="Q5582", name="Vincent van Gogh", death_date=date(1890, 7, 29),
        category="Kunst", sitelink_count=200, source_count=3,
    )
    b = assess_risk(early_artist, config=CONFIG,
                    image_commons_file=None, image_license_short_name=None)
    assert b.flags["works"] == "pass"
    # Gleiches Sterbejahr, andere Kategorie: bleibt pass (Sonderregel nur Kunst).
    c = assess_risk(
        make_candidate(name="Testperson Nachkrieg", qid="Q999000111", death=date(1954, 7, 13)),
        config=CONFIG, image_commons_file=None, image_license_short_name=None,
    )
    assert c.flags["works"] == "pass"


def test_publicity_block_rejects_with_reason() -> None:
    a = assess_risk(
        make_candidate(name="Marilyn Monroe", qid="Q4616", death=date(1962, 8, 4)),
        config=CONFIG, image_commons_file=None, image_license_short_name=None,
    )
    assert a.reject and "publicity" in a.reject_reason
    assert a.score > 3.0


def test_ethics_block_rejects() -> None:
    a = assess_risk(
        make_candidate(name="Adolf Hitler", qid="Q352", death=date(1945, 4, 30)),
        config=CONFIG, image_commons_file=None, image_license_short_name=None,
    )
    assert a.reject and "ethics" in a.reject_reason


def test_einstein_is_manual_review_not_reject() -> None:
    a = assess_risk(
        make_candidate(name="Albert Einstein", qid="Q937", death=date(1955, 4, 18)),
        config=CONFIG, image_commons_file="Einstein.jpg", image_license_short_name="Public domain",
    )
    assert not a.reject
    assert a.flags["publicity"] == "manual_review"
    assert 0 < a.score < 5


# --- Worker-Orchestrierung (Netzwerk/Store gefakt) ---

class FakePaginator:
    def __init__(self, keys):
        self._keys = keys

    def paginate(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        yield {"Contents": [{"Key": k} for k in self._keys if k.startswith(prefix)]}


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, *, Bucket, Key):
        import io

        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def test_assess_one_transitions_researched_to_verified() -> None:
    from app.workers.assess_risk import assess_one

    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    candidate = make_candidate()
    store.save_candidate(candidate)
    doc = store.load_candidate_document("Q1035")
    doc["status"] = "researched"
    doc["source_count"] = 3
    store.save_candidate_document("Q1035", doc)
    store.save_research_document("Q1035", {"wikidata_qid": "Q1035", "image_commons_file": "Darwin.jpg"})

    qid, result = assess_one(
        store.load_candidate_document("Q1035"),
        store=store, config=CONFIG, dry_run=False,
        license_fetcher=lambda f: "Public domain",
    )
    assert qid == "Q1035" and result.startswith("verified")
    saved = store.load_candidate_document("Q1035")
    assert saved["status"] == "verified"
    assert saved["risk_flags"]["image"] == "pass"
    assert saved["image_status"] == "commons_ok"
    assert saved["audit_trail"][-1]["to_status"] == "verified"
    assert isinstance(json.dumps(saved), str)


def test_assess_one_rejects_blocked_candidate() -> None:
    from app.workers.assess_risk import assess_one

    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    candidate = make_candidate(name="Adolf Hitler", qid="Q352", death=date(1945, 4, 30))
    store.save_candidate(candidate)
    doc = store.load_candidate_document("Q352")
    doc["status"] = "researched"
    store.save_candidate_document("Q352", doc)

    qid, result = assess_one(
        store.load_candidate_document("Q352"),
        store=store, config=CONFIG, dry_run=False,
        license_fetcher=lambda f: None,
    )
    assert result.startswith("rejected")
    saved = store.load_candidate_document("Q352")
    assert saved["status"] == "rejected"
    assert saved["status_reason"]
