"""Tests fuer Korpus-Phase 1b (Dedup ueber alle Quellen + Token-Zaehlung).

Der eigentliche Lauf braucht datatrove und Stunden Rechenzeit; getestet wird
deshalb das, was still falsch laufen kann: die Aufgabenzahl je Stufe (falsch
gesetzt liefert MinHash unbemerkt zu wenig Treffer) und die Bewertung der
Ergebniszahlen.
"""

from __future__ import annotations

import pytest

from app.workers.dedup_corpus import (
    MINHASH_BUCKETS,
    TokenCount,
    dedup_report,
    stage_task_counts,
    token_report,
)
from app.workers.prepare_corpus import CHARS_PER_TOKEN_DE

# --- Aufgabenzahl je Stufe ---

def test_bucket_stufe_bekommt_genau_einen_task_je_bucket() -> None:
    # Weniger Aufgaben als Buckets = unbearbeitete Buckets = unentdeckte
    # Dubletten, ohne dass irgendetwas fehlschlaegt.
    tasks = stage_task_counts(input_tasks=8)
    assert tasks["buckets"] == MINHASH_BUCKETS


def test_cluster_stufe_laeuft_einzeln() -> None:
    # Parallel gestartet saehe jede Aufgabe nur einen Teil der Buckets und
    # die zusammenhaengenden Gruppen zerfielen.
    assert stage_task_counts(input_tasks=32)["cluster"] == 1


def test_filter_stufe_passt_zur_signatur_stufe() -> None:
    # Die Loeschlisten sind nach Aufgaben-Rang benannt: weichen die Zahlen ab,
    # bekommt ein Shard die Liste eines anderen.
    tasks = stage_task_counts(input_tasks=13)
    assert tasks["filter"] == tasks["signatures"] == 13


@pytest.mark.parametrize("bad", [0, -1])
def test_ungueltige_aufgabenzahl_wird_abgelehnt(bad: int) -> None:
    with pytest.raises(ValueError):
        stage_task_counts(input_tasks=bad)


def test_ungueltige_bucketzahl_wird_abgelehnt() -> None:
    with pytest.raises(ValueError):
        stage_task_counts(input_tasks=4, num_buckets=0)


# --- Dedup-Bericht ---

def test_normale_dedup_quote_ohne_warnung() -> None:
    report = dedup_report(documents_before=1_000_000, documents_after=780_000)
    assert report.removed == 220_000
    assert report.duplicate_ratio == pytest.approx(0.22)
    assert report.warnings == []


def test_zu_wenig_entfernt_warnt_vor_falscher_verdrahtung() -> None:
    # Der haeufigste Fehler: Bucket-Stufe mit zu wenig Aufgaben gestartet.
    report = dedup_report(documents_before=1_000_000, documents_after=999_500)
    assert len(report.warnings) == 1
    assert "stage_task_counts" in report.warnings[0]


def test_zu_viel_entfernt_warnt_vor_quellenfehler() -> None:
    report = dedup_report(documents_before=1_000_000, documents_after=200_000)
    assert any("Quellen-Auswahl" in warning for warning in report.warnings)


def test_mehr_dokumente_nach_dedup_ist_ein_fehler() -> None:
    with pytest.raises(ValueError):
        dedup_report(documents_before=100, documents_after=101)


def test_leerer_korpus_bricht_nicht_an_division_durch_null() -> None:
    report = dedup_report(documents_before=0, documents_after=0)
    assert report.duplicate_ratio == 0.0


# --- Token-Bericht ---

def _count(source: str, tokens: int, chars_per_token: float = CHARS_PER_TOKEN_DE) -> TokenCount:
    return TokenCount(
        source=source,
        documents=max(1, tokens // 600),
        tokens=tokens,
        characters=int(tokens * chars_per_token),
    )


def test_erreichtes_ziel_meldet_keine_warnung() -> None:
    report = token_report(
        [_count("wikipedia_de", 2_000_000_000), _count("fineweb2_deu", 10_000_000_000)],
        target_tokens=12_000_000_000,
    )
    assert report["tokens"] == 12_000_000_000
    assert report["target_reached"] is True
    assert report["warnings"] == []
    assert report["measured_chars_per_token"] == pytest.approx(CHARS_PER_TOKEN_DE, abs=0.01)


def test_verfehltes_ziel_wird_beziffert() -> None:
    report = token_report([_count("wikipedia_de", 9_000_000_000)], target_tokens=12_000_000_000)
    assert report["target_reached"] is False
    assert any("3.00 Mrd fehlen" in warning for warning in report["warnings"])


def test_abweichende_zeichen_pro_token_verlangt_neuplanung() -> None:
    # Der ganze Zweck des Tokenizer-Laufs: die Schaetzung 3,3 pruefen. Liegt
    # die echte Rate deutlich darueber, liefert derselbe Text weniger Token
    # als geplant — alle Quellen-Budgets waeren zu klein.
    report = token_report(
        [_count("fineweb2_deu", 12_000_000_000, chars_per_token=4.2)],
        target_tokens=12_000_000_000,
    )
    warnung = " ".join(report["warnings"])
    assert "weniger Token als geplant" in warnung
    assert "4.20" in warnung


def test_geringe_abweichung_bleibt_unbeanstandet() -> None:
    # 10 % Abweichung ist Messrauschen zwischen Tokenizern, keine Neuplanung.
    report = token_report(
        [_count("wikipedia_de", 12_000_000_000, chars_per_token=CHARS_PER_TOKEN_DE * 1.10)],
        target_tokens=12_000_000_000,
    )
    assert report["warnings"] == []


def test_bericht_weist_token_je_quelle_aus() -> None:
    report = token_report(
        [_count("wikipedia_de", 1_000_000), _count("gutenberg_de", 500_000)],
        target_tokens=0,
    )
    assert report["per_source"] == {"wikipedia_de": 1_000_000, "gutenberg_de": 500_000}
    assert report["target_reached"] is True  # kein Ziel gesetzt


def test_leere_zaehlung_bricht_nicht() -> None:
    report = token_report([], target_tokens=0)
    assert report["tokens"] == 0
    assert report["measured_chars_per_token"] == 0.0


# --- Verdrahtung (nur wo datatrove installiert ist) ---

def test_datatrove_dedup_verdrahtung(tmp_path) -> None:
    """Prueft die echten datatrove-Signaturen, bevor ein Lauf Stunden kostet."""
    pytest.importorskip("datatrove")
    from app.workers.dedup_corpus import build_dedup_stages, build_minhash_config

    config = build_minhash_config()
    assert config.num_buckets == MINHASH_BUCKETS

    stages = build_dedup_stages(str(tmp_path / "korpus"), str(tmp_path / "out"))
    assert [[type(step).__name__ for step in stage] for stage in stages] == [
        ["JsonlReader", "MinhashDedupSignature"],
        ["MinhashDedupBuckets"],
        ["MinhashDedupCluster"],
        ["JsonlReader", "MinhashDedupFilter", "JsonlWriter"],
    ]
