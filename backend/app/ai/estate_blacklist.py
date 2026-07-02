"""Kanonische Blacklist kommerziell verwalteter Nachlaesse fuer smyst.com.

Quelle der Pipeline-Regel: Autopilot_Profile_Pipeline_Spec.md, Risiko-Check
"Publicity Rights / Marke". Die Liste speist estate_blacklist (Migration 0007)
bzw. den IDrive-e2-Store und wird vom risk-Worker sowie beim Ingest genutzt.

Belege (Stand 2026-07-02):
- CMG Worldwide Client List 2025 (cmgworldwide.com, offizielles PDF).
- Authentic Brands Group: Monroe, Presley, Ali (en.wikipedia.org/wiki/Authentic_Brands_Group).
- Einzelfaelle: Hebrew University/Greenlight (Einstein), Frida Kahlo Corporation,
  Anne-Frank-Fonds, King Estate, Picasso Administration, Conan Doyle Estate.

severity:
- "block":         nicht veroeffentlichen (aggressiv durchgesetzte Rechte).
- "manual_review": nur mit menschlicher Freigabe, ggf. Rechtsberatung.

qid=None bedeutet: Wikidata-QID beim Ingest per Namensabgleich verifizieren.
Diese Liste ersetzt keine juristische Pruefung.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from app.ai.historical_pipeline import RiskResult

BLOCK = "block"
REVIEW = "manual_review"


@dataclass(frozen=True)
class EstateEntry:
    name: str
    death_year: int
    manager: str
    severity: str
    qid: str | None = None


def _n(name: str) -> str:
    """Namensnormalisierung fuer den Fallback-Abgleich ohne QID."""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.casefold().replace(".", " ").replace(",", " ").split())


ESTATE_BLACKLIST: tuple[EstateEntry, ...] = (
    # --- Aggressiv durchgesetzte Nachlaesse -> block ---
    EstateEntry("James Dean", 1955, "CMG Worldwide (Liste 2025); Indiana: Publicity Right 100 Jahre postmortem", BLOCK, "Q83359"),
    # Herabgestuft 2026-07-02 (Expertenentscheidung, Freigabe Adam King "entscheide selbst"):
    # HUJ v. General Motors (C.D. Cal. 2012): Einsteins postmortales Publicity Right nach
    # NJ-Recht max. 50 Jahre -> 2005 abgelaufen; HUJ lizenziert weiter Marken (Merchandising).
    # Informative Profile ohne Werbenutzung: menschliche Freigabe statt Auto-Block.
    EstateEntry("Albert Einstein", 1955, "Hebrew University/Greenlight (Marke/Merchandising); Publicity Right lt. HUJ v. GM 2012 abgelaufen", REVIEW, "Q937"),
    # UK kennt kein postmortales Publicity Right; CMG-Vertretung betrifft Merchandising.
    EstateEntry("Alan Turing", 1954, "CMG Worldwide (Liste 2025); UK ohne postmortales Publicity Right", REVIEW, "Q7251"),
    EstateEntry("Frida Kahlo", 1954, "Frida Kahlo Corporation (Markenstreit dokumentiert)", BLOCK, "Q5588"),
    EstateEntry("Anne Frank", 1945, "Anne-Frank-Fonds (aggressive Rechtsdurchsetzung; ethisch hochsensibel)", BLOCK, "Q4583"),
    EstateEntry("Marilyn Monroe", 1962, "Authentic Brands Group", BLOCK, "Q4616"),
    EstateEntry("Elvis Presley", 1977, "Authentic Brands Group / EPE", BLOCK, "Q303"),
    EstateEntry("Muhammad Ali", 2016, "Authentic Brands Group", BLOCK),
    EstateEntry("Michael Jackson", 2009, "MJ Estate / Sony", BLOCK, "Q2831"),
    EstateEntry("Martin Luther King Jr.", 1968, "King Estate (sehr klagefreudig)", BLOCK, "Q8027"),
    EstateEntry("Pablo Picasso", 1973, "Picasso Administration", BLOCK, "Q5593"),
    EstateEntry("Bruce Lee", 1973, "Bruce Lee Family Companies", BLOCK),
    EstateEntry("Walt Disney", 1966, "The Walt Disney Company (Marke)", BLOCK),
    # --- CMG Worldwide Client List 2025, Sterbejahr im Pipeline-Fenster -> manual_review ---
    EstateEntry("Mark Twain", 1910, "CMG Worldwide (Liste 2025); Werke gemeinfrei", REVIEW, "Q7245"),
    EstateEntry("Oscar Wilde", 1900, "CMG Worldwide (Liste 2025); Werke gemeinfrei", REVIEW, "Q30875"),
    EstateEntry("Thomas Edison", 1931, "CMG Worldwide (Liste 2025)", REVIEW, "Q8743"),
    EstateEntry("Amelia Earhart", 1937, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Bessie Coleman", 1926, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Will Rogers", 1935, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("George S. Patton Jr.", 1945, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Jean Harlow", 1937, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Al Jolson", 1950, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Lou Gehrig", 1941, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Jim Thorpe", 1953, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Jack Johnson", 1946, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Christy Mathewson", 1925, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Shoeless Joe Jackson", 1951, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Glenn Miller", 1944, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Lead Belly", 1949, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Hank Williams Sr.", 1953, "Nachlass aktiv; historisch CMG-vertreten", REVIEW),
    EstateEntry("Babe Ruth", 1948, "historisch CMG; aktuelle Vertretung pruefen", REVIEW, "Q213812"),
    # --- CMG-Liste, Sterbejahr nach Fenster (relevant bei works=restricted) ---
    EstateEntry("Ty Cobb", 1961, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Tris Speaker", 1958, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Rogers Hornsby", 1963, "CMG Worldwide (Liste 2025)", REVIEW),
    EstateEntry("Frank Lloyd Wright", 1959, "CMG Worldwide (Liste 2025) / FLW Foundation", REVIEW),
    EstateEntry("Billie Holiday", 1959, "Nachlass aktiv; historisch CMG-vertreten", REVIEW),
    EstateEntry("Buddy Holly", 1959, "Nachlass aktiv; historisch CMG-vertreten", REVIEW),
    EstateEntry("Malcolm X", 1965, "Shabazz-Familie / CMG-Umfeld (Liste 2025)", REVIEW),
    # --- Unabhaengige Nachlaesse / Marken / Sonderrecht ---
    EstateEntry("Antoine de Saint-Exupery", 1944, "Succession Saint-Exupery; Le-Petit-Prince-Marken; frz. droit moral", REVIEW, "Q2985"),
    EstateEntry("Mahatma Gandhi", 1948, "Indien: Emblems and Names Act untersagt kommerzielle Nutzung", REVIEW, "Q1001"),
    EstateEntry("Eva Peron", 1952, "Erben aktiv; politisch sensibel (Argentinien)", REVIEW),
    EstateEntry("Mustafa Kemal Atatuerk", 1938, "Tuerkei: Gesetz 5816 stellt Herabwuerdigung unter Strafe", REVIEW),
    EstateEntry("Henri Matisse", 1954, "Succession Matisse; frz. droit moral", REVIEW),
    EstateEntry("Arthur Conan Doyle", 1930, "Conan Doyle Estate Ltd (Klagehistorie, z. B. Netflix 2020)", REVIEW),
    EstateEntry("Nikola Tesla", 1943, "Name als Fremdmarke (Tesla Inc.) belegt; Persona frei", REVIEW, "Q9036"),
    EstateEntry("Harry Houdini", 1926, "Nachlass-/Markenhistorie pruefen", REVIEW),
    EstateEntry("Al Capone", 1947, "Erben klagten gegen Medienprodukte; ethisch sensibel", REVIEW),
    EstateEntry("Winston Churchill", 1965, "Churchill Heritage Ltd lizenziert Namensrechte", REVIEW, "Q8016"),
    EstateEntry("Le Corbusier", 1965, "Fondation Le Corbusier; frz. droit moral", REVIEW),
    EstateEntry("Coco Chanel", 1971, "Name ist aktive Marke (Chanel S.A.)", REVIEW),
    EstateEntry("Charlie Chaplin", 1977, "Chaplin Office / Bubbles Inc.", REVIEW, "Q882"),
    EstateEntry("J.R.R. Tolkien", 1973, "Tolkien Estate (aktive Rechtsdurchsetzung)", REVIEW),
    EstateEntry("Ian Fleming", 1964, "Ian Fleming Publications Ltd", REVIEW),
)

_BY_QID: dict[str, EstateEntry] = {e.qid: e for e in ESTATE_BLACKLIST if e.qid}
_BY_NAME: dict[str, EstateEntry] = {_n(e.name): e for e in ESTATE_BLACKLIST}


def find_estate_entry(qid: str | None, name: str) -> EstateEntry | None:
    """QID-Abgleich zuerst, Namensabgleich (normalisiert) als Fallback."""
    if qid and qid in _BY_QID:
        return _BY_QID[qid]
    return _BY_NAME.get(_n(name))


def publicity_risk(qid: str | None, name: str) -> RiskResult:
    entry = find_estate_entry(qid, name)
    if entry is None:
        return RiskResult.PASS
    return RiskResult.BLOCK if entry.severity == BLOCK else RiskResult.MANUAL_REVIEW
