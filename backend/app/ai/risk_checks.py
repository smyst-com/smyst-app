"""Vier-Stufen-Risiko-Check der smyst.com Autopilot-Pipeline (Worker 3, Domain).

Prueft researched-Kandidaten vor der Twin-Erstellung:
1. Werke      — Sterbejahr vs. Gemeinfreiheits-Cutoff (Zitate erlaubt oder nur Paraphrase).
2. Bild       — Commons-Lizenz des recherchierten Bildes (Todestag des FOTOGRAFEN zaehlt,
                deshalb niemals "Person lange tot" als Lizenzbeleg akzeptieren).
3. Publicity  — estate_blacklist (kommerziell verwaltete Nachlaesse / Marken).
4. Ethik      — Watchlist: Taeter historischer Verbrechen (block) und religioese
                Zentralfiguren (manual_review); Plattform ist familienfreundlich.

Kein Netzwerk, kein Speicher — der Runner (app/workers/assess_risk.py) injiziert
Commons-Metadaten. Ergebnis ist ein reproduzierbares RiskAssessment.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from app.ai.estate_blacklist import find_estate_entry, publicity_risk
from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig, RiskResult


def _n(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.casefold().split())


@dataclass(frozen=True)
class EthicsEntry:
    name: str
    result: RiskResult
    reason: str
    qid: str | None = None


#: Ethik-Watchlist. block = niemals veroeffentlichen; manual_review = nur mit
#: menschlicher Freigabe. Bewusst konservativ; Erweiterung im Review-Prozess.
ETHICS_WATCHLIST: tuple[EthicsEntry, ...] = (
    EthicsEntry("Adolf Hitler", RiskResult.BLOCK, "NS-Haupttaeter; Chat-Verkoerperung ausgeschlossen", "Q352"),
    EthicsEntry("Heinrich Himmler", RiskResult.BLOCK, "NS-Haupttaeter", "Q43067"),
    EthicsEntry("Joseph Goebbels", RiskResult.BLOCK, "NS-Haupttaeter", "Q44331"),
    EthicsEntry("Hermann Goering", RiskResult.BLOCK, "NS-Haupttaeter"),
    EthicsEntry("Reinhard Heydrich", RiskResult.BLOCK, "NS-Haupttaeter"),
    EthicsEntry("Adolf Eichmann", RiskResult.BLOCK, "NS-Haupttaeter"),
    EthicsEntry("Josef Stalin", RiskResult.BLOCK, "Massenverbrechen; Chat-Verkoerperung ausgeschlossen", "Q855"),
    EthicsEntry("Benito Mussolini", RiskResult.BLOCK, "faschistischer Diktator", "Q23559"),
    EthicsEntry("Mohammed", RiskResult.BLOCK, "Darstellungs-/Verkoerperungsverbot; religioes hochsensibel", "Q9458"),
    EthicsEntry("Jesus Christus", RiskResult.MANUAL_REVIEW, "religioese Zentralfigur; nur mit Freigabe und klaren Regeln", "Q302"),
    EthicsEntry("Moses", RiskResult.MANUAL_REVIEW, "religioese Zentralfigur"),
    EthicsEntry("Siddhartha Gautama", RiskResult.MANUAL_REVIEW, "religioese Zentralfigur (Buddha)", "Q9441"),
    EthicsEntry("Buddha", RiskResult.MANUAL_REVIEW, "religioese Zentralfigur"),
)

_ETHICS_BY_QID = {e.qid: e for e in ETHICS_WATCHLIST if e.qid}
_ETHICS_BY_NAME = {_n(e.name): e for e in ETHICS_WATCHLIST}

#: Auf Commons akzeptierte Lizenz-Kurznamen (extmetadata.LicenseShortName).
ALLOWED_LICENSE_PREFIXES = (
    "public domain", "pd", "cc0", "cc by", "cc-by", "no restrictions",
)

#: Rechtsanalyse 2026-07-04 (Abschnitt 2.3): Werke von Kuenstlern mit Sterbejahr
#: nach 1950 koennen jurisdiktionsabhaengig noch urheberrechtlich geschuetzt sein
#: (70 Jahre p.m.a. zzgl. Kriegsverlaengerungen) -> works=restricted erzwingen,
#: auch wenn der allgemeine max_death_year-Cutoff noch PASS ergeben wuerde.
ART_WORKS_RESTRICTED_AFTER_YEAR = 1950
ART_CATEGORIES = ("Kunst",)


def ethics_risk(qid: str | None, name: str) -> tuple[RiskResult, str | None]:
    entry = _ETHICS_BY_QID.get(qid or "") or _ETHICS_BY_NAME.get(_n(name))
    if entry is None:
        return RiskResult.PASS, None
    return entry.result, entry.reason


def evaluate_commons_license(license_short_name: str | None) -> RiskResult:
    """Bewertet extmetadata.LicenseShortName eines Commons-Bildes."""
    if not license_short_name:
        return RiskResult.MANUAL_REVIEW  # Metadaten fehlen -> Mensch entscheidet
    normalized = license_short_name.strip().casefold()
    if any(normalized.startswith(prefix) for prefix in ALLOWED_LICENSE_PREFIXES):
        return RiskResult.PASS
    return RiskResult.BLOCK  # unfreie/unklare Lizenz -> Bild verwerfen (nicht Profil)


@dataclass(frozen=True)
class RiskAssessment:
    flags: dict[str, str]          # {"works"|"image"|"publicity"|"ethics": RiskResult-Wert}
    score: float                   # 0.00 (frei) bis 10.00 (blockiert)
    image_status: str              # commons_ok | generated | none
    reject: bool
    reject_reason: str | None
    notes: tuple[str, ...]


_WEIGHTS = {"works": 1.5, "image": 1.0, "publicity": 4.0, "ethics": 5.0}
_RESULT_FACTOR = {
    RiskResult.PASS: 0.0,
    RiskResult.RESTRICTED: 0.5,
    RiskResult.MANUAL_REVIEW: 1.0,
    RiskResult.BLOCK: 2.0,
}


def assess_risk(
    candidate: HistoricalCandidate,
    *,
    config: PipelineConfig,
    image_commons_file: str | None,
    image_license_short_name: str | None,
    image_is_own_photo_of_2d_art: bool = False,
) -> RiskAssessment:
    """Fuehrt alle vier Checks aus und aggregiert Score + Entscheidung.

    Wichtig: Ein unfreies BILD blockiert nie das Profil — es wird verworfen
    und durch ein gekennzeichnetes KI-Portrait ersetzt (image_status=generated).
    Nur publicity/ethics koennen das Profil selbst blockieren.
    """
    notes: list[str] = []

    # 1. Werke
    if candidate.death_date.year > config.max_death_year:
        works = RiskResult.RESTRICTED
        notes.append(
            f"Sterbejahr {candidate.death_date.year} > {config.max_death_year}: "
            "keine Originalzitate/Werkauszuege, nur paraphrasierte Fakten"
        )
    elif (
        candidate.category in ART_CATEGORIES
        and candidate.death_date.year > ART_WORKS_RESTRICTED_AFTER_YEAR
    ):
        works = RiskResult.RESTRICTED
        notes.append(
            f"Kunst mit Sterbejahr {candidate.death_date.year} > "
            f"{ART_WORKS_RESTRICTED_AFTER_YEAR}: Werke koennen noch geschuetzt sein "
            "(70 Jahre p.m.a.) — keine Werkreproduktionen/Zitate, nur Paraphrase"
        )
    else:
        works = RiskResult.PASS

    # 2. Bild
    if image_commons_file:
        license_result = evaluate_commons_license(image_license_short_name)
        if license_result is RiskResult.PASS:
            image, image_status = RiskResult.PASS, "commons_ok"
            if image_is_own_photo_of_2d_art:
                notes.append("Reproduktion eines 2D-Werks: Originalwerk-Gemeinfreiheit massgeblich")
        elif license_result is RiskResult.MANUAL_REVIEW:
            image, image_status = RiskResult.MANUAL_REVIEW, "generated"
            notes.append(f"Commons-Lizenz unklar ({image_license_short_name!r}): KI-Portrait verwenden, Mensch prueft")
        else:
            image, image_status = RiskResult.RESTRICTED, "generated"
            notes.append(f"Commons-Lizenz unfrei ({image_license_short_name!r}): Bild verworfen, KI-Portrait")
    else:
        image, image_status = RiskResult.RESTRICTED, "generated"
        notes.append("kein Commons-Bild: gekennzeichnetes KI-Portrait verwenden")

    # 3. Publicity / Blacklist
    publicity = publicity_risk(candidate.wikidata_qid, candidate.name)
    if publicity is not RiskResult.PASS:
        entry = find_estate_entry(candidate.wikidata_qid, candidate.name)
        notes.append(f"estate_blacklist: {entry.manager if entry else 'Treffer'}")

    # 4. Ethik
    ethics, ethics_reason = ethics_risk(candidate.wikidata_qid, candidate.name)
    if ethics_reason:
        notes.append(f"Ethik-Watchlist: {ethics_reason}")

    flags = {
        "works": works.value,
        "image": image.value,
        "publicity": publicity.value,
        "ethics": ethics.value,
    }
    raw = sum(_WEIGHTS[key] * _RESULT_FACTOR[RiskResult(value)] for key, value in flags.items())
    max_raw = sum(weight * 2.0 for weight in _WEIGHTS.values())
    score = round(10.0 * raw / max_raw, 2)

    reject = publicity is RiskResult.BLOCK or ethics is RiskResult.BLOCK
    reject_reason = None
    if reject:
        blocked = "publicity" if publicity is RiskResult.BLOCK else "ethics"
        reject_reason = f"Risiko-Check {blocked}=block: " + (
            notes[-1] if notes else "siehe Watchlist/Blacklist"
        )

    return RiskAssessment(
        flags=flags,
        score=score,
        image_status=image_status,
        reject=reject,
        reject_reason=reject_reason,
        notes=tuple(notes),
    )
