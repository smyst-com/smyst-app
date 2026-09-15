"""smyst.com Profil-Doktor: dauerhafte Kontrolle und Vervollstaendigung ALLER
publizierten Profile (Profil-Autopilot, Auftrag Inhaber 15.09.2026).

Der Autopilot (pipeline-*) veroeffentlicht taeglich neue Profile; der
Profil-Doktor ist sein Gegenstueck fuer den BESTAND: Er rotiert durch den
gesamten Publish-Index, prueft jedes Profil einzeln und regelmaessig und
ergaenzt fehlende Angaben — NUR soweit sie aus gesicherten Quellen
zuverlaessig ermittelbar sind. Niemals wird etwas geloescht, unpublishet
oder ein Status veraendert.

Pruefungen je Profil (aus Publish-Index + gesichertem Wikidata-Snapshot):

1. Vollstaendigkeit: birth_place, death_place, birth_date, death_date,
   birth_label, death_label, Kategorie, Beschreibung.
2. Ehrliche Anzeige-Labels: Wikidata-Jahrespraezision wird aktuell als
   "01.01.1859" angezeigt (fake Praezision). Praezision 9/8 wird zu "1859"
   bzw. "ca. 1859". Nur das Label, nie birth_date/death_date (ISO bleibt).
3. Fehlende Orte: P19/P20 aus dem Snapshot (gleiche Resolver-Regeln wie
   backfill_places — volle Werte werden NIE ueberschrieben).
4. Fehlende Daten: P569/P570 aus dem Snapshot, nur wenn das Feld ganz leer ist.
5. Eigene-Modell-Extraktion (smyst-1.1): Hat Wikidata KEINEN Ort (P19/P20
   leer), extrahiert das eigene Modell Geburts-/Sterbeort aus den
   gespeicherten Wikipedia-Texten. Anti-Halluzinations-Gate: Der Ortsname
   muss IM Quelltext wortgrenzgenau vorkommen, sonst wird er verworfen.
   Pro Profil max. DOCTOR_MAX_MODEL_ATTEMPTS Versuche (Kostenbremse).
6. Widersprueche: Tod vor Geburt, Lebensalter > 122 Jahre, doppelte
   Namen+Geburtsjahr-Kombinationen im Index — NUR Bericht, keine Aenderung.
7. Anreicherungs-Flag: kurze/fehlende Beschreibung setzt needs_rebuild
   (Futter fuer den QA-gegateen rebuild-one, keine automatische Massnahme).

Nach jedem Schreiben wird der Store neu gelesen und verifiziert (Slug, Name,
Sichtbarkeit unveraendert, Felder wie beabsichtigt). Schlaegt die Verifikation
an, wird der Vorher-Zustand wiederhergestellt und der Fehler berichtet.

Schreibkonflikt-Schutz mit dem taeglichen Orts-Backfill: Vor dem Index-PUT
wird der Index ERNEUT geladen und die Aenderungen datensatzweise nur auf
noch-leere Felder angewendet (Last-Writer-Wins auf Feldebene statt Objekt).

Rotation: pipeline/stats/doctor-rotation.json (qid -> checked_at/attempts);
nie gepruefte zuerst, dann aelteste Pruefung. Je Lauf zusaetzlich ein
Extraktions-Budget fuer unvollstaendige Profile, damit der sichtbare
Fehlbestand schneller schrumpft als der Rotationsumlauf.

Start:
    python -m app.workers.profile_doctor --dry-run
    python -m app.workers.profile_doctor --enabled --limit 250
    python -m app.workers.profile_doctor --enabled --only-incomplete --limit 400
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from typing import Callable, Optional

#: Platz fuer eine Modell-Antwort: Text oder None (Fehlschlag/Fehler).
LlmPost = Callable[[str], Optional[str]]

from app.ai.publisher import PUBLISH_INDEX_KEY
from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig
from app.ai.wikidata_places import (
    P_BIRTH_PLACE,
    P_DEATH_PLACE,
    PlaceResolver,
    claim_item_ids,
)
from app.integrations.candidate_store import (
    RESEARCH_PREFIX,
    SOURCE_PREFIX,
    CandidateStore,
    build_s3_client,
)
from app.workers.backfill_places import _load_entity
from app.workers.ingest_candidates import _pipeline_bucket
from app.workers.research_candidates import SUMMARY_URL, _get_json

#: Wo die Rotations-Buchhaltung liegt (kompakt, 1 GET/PUT je Lauf).
ROTATION_KEY = "pipeline/stats/doctor-rotation.json"
#: Letzter Bericht fuer Health-Check/Admin-Sicht.
REPORT_KEY = "pipeline/stats/profile-doctor-latest.json"

PLACE_FIELDS = (("birth_place", P_BIRTH_PLACE), ("death_place", P_DEATH_PLACE))
DATE_FIELDS = (("birth_date", "P569"), ("death_date", "P570"))
LABEL_FIELDS = (("birth_label", "P569"), ("death_label", "P570"))

#: Alle Felder, die der Doktor je schreiben darf — alles andere bleibt,
#: wie es ist (PAUSCHALSCHUTZ: keine vorhandenen Werte ueberschreiben).
WRITABLE_FIELDS = {"birth_place", "death_place", "birth_date", "death_date", "birth_label", "death_label"}

#: Beschreibungen kuerzer als das greift das Frontend-Completeness-Check ab
#: (isCompletePublicProfile: >= 40 Zeichen) — darunter ist das Profil unvollstaendig.
MIN_DESCRIPTION_LENGTH = 40

#: Kostenbremse fuer die Modell-Extraktion: nach so vielen Versuchen ohne
#: Befund wird ein Profil nicht erneut per Modell gefragt.
MAX_MODEL_ATTEMPTS = 2

#: Wikidata-Zeitpraezision (11=Monat, 10=Tag, 9=Jahr, 8=Dekade).
PRECISION_DAY = 10
PRECISION_MONTH = 11
PRECISION_YEAR = 9
PRECISION_DECADE = 8

FetchJson = Callable[[str], dict]

_ISO_FAKE_FULL = re.compile(r"^(\d{4})-01-01$")
_ISO_MONTH_ONLY = re.compile(r"^(\d{4})-(\d{2})-01$")


# --- Store-Helfer (gleiche Muster wie backfill_places) ---------------------

def _get_json_object(store: CandidateStore, key: str):
    try:
        response = store._client.get_object(Bucket=store._bucket, Key=key)  # noqa: SLF001
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception:  # noqa: BLE001 - fehlende Objekte sind ein Normalfall
        return None


def _put_json_object(store: CandidateStore, key: str, payload) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    store._client.put_object(  # noqa: SLF001
        Bucket=store._bucket, Key=key, Body=body, ContentType="application/json"
    )


# --- Wikidata-Hilfen --------------------------------------------------------

def _time_value(entity: dict, prop: str) -> dict | None:
    """Bestes (bevorzugtes, sonst erstes) Zeit-Statement einer Eigenschaft."""
    for claim in entity.get("claims", {}).get(prop, []):
        if claim.get("rank") == "deprecated":
            continue
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if isinstance(value, dict) and "time" in value:
            return value
    return None


def _iso_from_time(value: dict) -> str | None:
    """"+1859-00-00T00:00:00Z" -> "1859-01-01"; ohne Monat/Tag Null-Ergaenzung."""
    raw = str(value.get("time", ""))
    match = re.match(r"^([+-])(\d{4,})-(\d{2})-(\d{2})T", raw)
    if not match:
        return None
    sign, year, month, day = match.groups()
    if sign == "-":
        return None  # v. Chr. nicht als ISO-Datum erzeugen
    year_int = int(year)
    if year_int < 1 or year_int > 2200:
        return None
    month = "01" if month == "00" else month
    day = "01" if day == "00" else day
    return f"{year_int:04d}-{month}-{day}"


def _honest_label(value: dict) -> str | None:
    """Anzeige-Label gemaess Praezision: '1859', 'ca. 1859' oder '03.1859'."""
    precision = value.get("precision")
    raw = str(value.get("time", ""))
    match = re.match(r"^([+-])(\d{4})-(\d{2})", raw)
    if not match:
        return None
    year = int(match.group(2))
    if year < 1 or year > 2200:
        return None
    if precision == PRECISION_YEAR:
        return str(year)
    if precision == PRECISION_DECADE:
        return f"ca. {year}"
    if precision == PRECISION_MONTH:
        return f"{int(match.group(3)):02d}.{year}"
    return None


# --- Modell-Extraktion (eigenes Modell, Anti-Halluzinations-Gate) -----------

def _word_present(text: str, needle: str) -> bool:
    """Wortgrenzen-Pruefung: "Halle" trifft nicht auf "Halland"."""
    if not text or not needle:
        return False
    return re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", text, re.IGNORECASE) is not None


def parse_model_json(raw: str | None) -> dict:
    """Ersten JSON-Block aus der Modellantwort lesen; sonst Regex-Fallback."""
    if not raw:
        return {}
    match = re.search(r"\{[^{}]*\}", raw, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    found: dict[str, str] = {}
    for field in ("birth_place", "death_place"):
        field_match = re.search(rf'"{field}"\s*:\s*"([^"]+)"', raw)
        if field_match:
            found[field] = field_match.group(1)
    return found


_EXTRACTION_PROMPT = (
    "Du extrahierst Fakten aus Wikipedia-Texten. Antworte AUSSCHLIESSLICH mit "
    "einem JSON-Objekt und nichts anderem.\n"
    "Regeln: Nenne einen Ort NUR, wenn der Text ihn explizit als Geburtsort "
    'bzw. Sterbeort nennt ("geboren in/auf dem/at", "starb in", "died at"). '
    "Erfinde NIEMALS einen Ort. Wenn der Text es nicht nennt, setze null.\n"
    'Format: {{"birth_place": "<Ort>" oder null, "death_place": "<Ort>" oder null}}\n\n'
    "Person: {name} ({years})\n\nText:\n{text}"
)


def extract_places_via_model(
    llm_post: LlmPost,
    *,
    name: str,
    birth_year: str | None,
    death_year: str | None,
    texts: list[str],
) -> dict[str, str]:
    """Fragt das eigene Modell nach Geburts-/Sterbeort; prueft beide gegen den Text.

    Rueckgabe nur mit Feldern, deren Ortsname wortgrenzgenau im Quelltext
    steht (Land wird abgeschnitten, wenn es im Text nicht vorkommt). Alles
    andere wird verworfen — das Modell kann hier nichts erfinden.
    """
    years = f"{birth_year or '?'}–{death_year or '?'}"
    joined = "\n\n".join(text.strip() for text in texts if text and text.strip())[:4000]
    if not joined:
        return {}
    prompt = _EXTRACTION_PROMPT.format(name=name, years=years, text=joined)
    data = parse_model_json(llm_post(prompt))
    extracted: dict[str, str] = {}
    for field in ("birth_place", "death_place"):
        value = str(data.get(field) or "").strip()
        if not value or value.lower() in ("null", "none", "unknown", "unbekannt"):
            continue
        city, _sep, country = value.partition(",")
        city = city.strip()
        if not city or not _word_present(joined, city):
            continue  # Anti-Halluzinations-Gate
        country = country.strip()
        if country and not _word_present(joined, country):
            value = city  # erfundenes Land abschneiden — Stadt steht im Text
        extracted[field] = value
    return extracted


def build_default_llm_post() -> LlmPost | None:  # pragma: no cover - Verdrahtung
    """HTTP-Anbindung an den eigenen llama-server (SMYST_LLM_BASE_URL)."""
    import httpx

    from app.core.config import get_settings

    base_url = (get_settings().smyst_llm_base_url or "").rstrip("/")
    if not base_url:
        return None

    def llm_post(prompt: str) -> str | None:
        try:
            timeout = float(get_settings().llm_provider_timeout_seconds or 240)
            response = httpx.post(
                f"{base_url}/chat/completions",
                json={
                    "model": "smyst-1.0",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                    "max_tokens": 120,
                },
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
        except Exception:
            return None

    return llm_post


# --- Audit je Profil --------------------------------------------------------

def audit_record(record: dict, entity: dict | None) -> dict:
    """Vollstaendigkeits- und Widerspruchs-Pruefung eines Index-Eintrags."""
    findings: dict = {"missing": [], "contradictions": [], "needs_rebuild": False}

    for field in ("birth_place", "death_place", "birth_date", "death_date",
                  "birth_label", "death_label", "category"):
        if not record.get(field):
            findings["missing"].append(field)
    description = str(record.get("description") or "")
    if len(description.strip()) < MIN_DESCRIPTION_LENGTH:
        findings["missing"].append("description")
        findings["needs_rebuild"] = True

    birth = record.get("birth_date")
    death = record.get("death_date")
    if birth and death:
        birth_year = int(str(birth)[:4])
        death_year = int(str(death)[:4])
        if death_year < birth_year:
            findings["contradictions"].append(
                f"death_date {death} vor birth_date {birth}"
            )
        elif death_year - birth_year > 122:
            findings["contradictions"].append(
                f"Lebensalter {death_year - birth_year} Jahre unplaussibel"
            )
    return findings


def place_fills_from_entity(entity: dict | None, record: dict, resolver: PlaceResolver) -> dict[str, str]:
    """Fehlende Orte aus P19/P20 — volle Werte werden nie angefasst."""
    updates: dict[str, str] = {}
    if entity is None:
        return updates
    for field, prop in PLACE_FIELDS:
        if record.get(field):
            continue
        place_qids = claim_item_ids(entity, prop)
        if not place_qids:
            continue
        resolved = resolver.resolve(place_qids[0])
        if resolved:
            updates[field] = resolved
    return updates


def date_fills_from_entity(entity: dict | None, record: dict) -> dict[str, str]:
    """Ganz fehlende Lebensdaten aus P569/P570 (ISO, v. Chr. bleibt aus).

    Bei Jahres-/Dekaden-Praezision wird zugleich das ehrliche Label gesetzt,
    damit nicht frisch ein "01.01.1859" erzeugt wird.
    """
    updates: dict[str, str] = {}
    if entity is None:
        return updates
    for field, prop in DATE_FIELDS:
        if record.get(field):
            continue
        value = _time_value(entity, prop)
        if value is None:
            continue
        iso = _iso_from_time(value)
        if iso:
            updates[field] = iso
            honest = _honest_label(value)
            if honest and precision_hides_day(value.get("precision")):
                label_field = f"{field.rsplit('_date', 1)[0]}_label"
                if not record.get(label_field):
                    updates[label_field] = honest
    return updates


def precision_hides_day(precision) -> bool:
    return precision in (PRECISION_YEAR, PRECISION_DECADE)


def label_fixes_from_entity(entity: dict | None, record: dict) -> dict[str, str]:
    """Fake-Praezision korrigieren: "01.01.1859" -> "1859" (nur das Label).

    Gilt fuer gesetzte fake-ISO-Labels und fuer leere Labels, die im Build
    auf das fake-ISO-Datum zurueckfallen wuerden (record.birth_label fehlt,
    merge nutzt record.birth_date).
    """
    updates: dict[str, str] = {}
    if entity is None:
        return updates
    for field, prop in LABEL_FIELDS:
        current = record.get(field)
        date_field = f"{field.rsplit('_label', 1)[0]}_date"
        fallback_fake = not current and _ISO_FAKE_FULL.match(str(record.get(date_field) or ""))
        if current:
            full = _ISO_FAKE_FULL.match(str(current))
            # "1859-01-01" ist zugleich Monatsmuster — Vollmuster hat Vorrang,
            # sonst wuerde die Monats-Regel den Jahres-Fall abwuerfen.
            month = None if full else _ISO_MONTH_ONLY.match(str(current))
        elif fallback_fake:
            full, month = fallback_fake, None
        else:
            continue
        if not full and not month:
            continue  # echte Labels ("ca. 384 v. Chr.", "Stadt, Land") bleiben
        value = _time_value(entity, prop)
        if value is None:
            continue
        honest = _honest_label(value)
        if not honest:
            continue
        # Nur ersetzen, wenn die Praezision das aktuelle Label auch erklaert:
        # Monat 03 + Label "01.03.1859" -> "03.1859"; Jahr + "01.01.1859" -> "1859".
        if month and value.get("precision") != PRECISION_MONTH:
            continue
        if full and value.get("precision") not in (PRECISION_YEAR, PRECISION_DECADE):
            continue
        updates[field] = honest
    return updates


def find_duplicates(index: list[dict], *, limit: int = 50) -> list[dict]:
    """Gleicher Name + gleiches Geburtsjahr bei verschiedenen QIDs — nur Bericht."""
    groups: dict[tuple[str, str], list[str]] = {}
    for record in index:
        qid = record.get("wikidata_qid")
        name = str(record.get("name") or "").casefold().strip()
        birth = str(record.get("birth_date") or "")[:4]
        if not qid or not name or not birth:
            continue
        groups.setdefault((name, birth), []).append(qid)
    duplicates = [
        {"name": name, "birth_year": birth, "qids": sorted(qids)}
        for (name, birth), qids in groups.items()
        if len(set(qids)) > 1
    ]
    return duplicates[:limit]


# --- Rotation ---------------------------------------------------------------

def _load_rotation(store: CandidateStore) -> dict:
    ledger = _get_json_object(store, ROTATION_KEY)
    return ledger if isinstance(ledger, dict) else {}


def _checked_at(entry) -> str:
    return str(entry.get("checked_at") or "") if isinstance(entry, dict) else ""


def select_records(
    index: list[dict],
    ledger: dict,
    *,
    limit: int,
    only_incomplete: bool = False,
) -> list[dict]:
    """Rotationsauswahl: nie gepruefte zuerst, dann aelteste Pruefung.

    only_incomplete=True priorisiert Eintraege mit fehlenden Orts-/Datums-
    feldern (Nachhol-Modus fuer den sichtbaren Fehlbestand).
    """
    def incomplete(record: dict) -> bool:
        return not record.get("birth_place") or not record.get("death_place")

    pool = [r for r in index if r.get("wikidata_qid") and r.get("visible", True) and r.get("qa_passed", True)]
    if only_incomplete:
        pool = [r for r in pool if incomplete(r)]

    def sort_key(record: dict):
        entry = ledger.get(record.get("wikidata_qid"))
        checked = _checked_at(entry)
        return (bool(checked), checked, str(record.get("wikidata_qid")))

    pool.sort(key=sort_key)
    return pool[: max(limit, 0)]


# --- Ausfuehrung ------------------------------------------------------------

def _profile_key(qid: str) -> str:
    return f"pipeline/published/{qid}/profile.json"


def _source_texts(store: CandidateStore, qid: str, fetch_json: FetchJson, research: dict) -> list[str]:
    """Wikipedia-Texte fuer die Extraktion: Snapshot, sonst live (und sichern)."""
    texts: list[str] = []
    for wiki in ("de", "en"):
        key = f"{SOURCE_PREFIX}{qid}/wikipedia-{wiki}.json"
        snapshot = _get_json_object(store, key)
        extract = snapshot.get("extract") if isinstance(snapshot, dict) else None
        if not extract:
            title = (research.get("wikipedia_titles") or {}).get(f"{wiki}wiki")
            if not title:
                continue
            try:
                summary = fetch_json(SUMMARY_URL.format(lang=wiki, title=str(title).replace(" ", "_")))
            except Exception:  # noqa: BLE001 - einzelne Wiki-Ausfaelle sind normal
                continue
            extract = summary.get("extract")
        if extract:
            texts.append(str(extract))
    return texts


def _verify_written_profile(
    store: CandidateStore,
    qid: str,
    *,
    before: dict | None,
    expected_updates: dict[str, str],
) -> str | None:
    """Selbsttest nach dem Schreiben: Store neu lesen und Felder gegenpruefen."""
    after = _get_json_object(store, _profile_key(qid))
    if not isinstance(after, dict):
        return "Selbsttest: profile.json nach dem Schreiben unlesbar"
    if before is not None and (after.get("slug"), after.get("name")) != (before.get("slug"), before.get("name")):
        return "Selbsttest: slug/name haben sich veraendert"
    for field, value in expected_updates.items():
        if after.get(field) != value:
            return f"Selbsttest: {field} enthaelt nicht den beabsichtigten Wert"
    return None


def run_doctor(
    *,
    store: CandidateStore,
    limit: int,
    dry_run: bool,
    run_date: date,
    only_incomplete: bool = False,
    extraction_budget: int = 40,
    llm_post: LlmPost | None = None,
    fetch_json: FetchJson = _get_json,
    smoke_model: bool = True,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    index = _get_json_object(store, PUBLISH_INDEX_KEY)
    report: dict = {
        "worker": "profile_doctor",
        "run_date": run_date.isoformat(),
        "started_at": now.isoformat(),
        "dry_run": dry_run,
        "only_incomplete": only_incomplete,
        "total_index": len(index) if isinstance(index, list) else 0,
        "checked": [],
        "changed": {},
        "model_extractions": {},
        "model_attempts_skipped": [],
        "contradictions": {},
        "duplicates": [],
        "needs_rebuild": [],
        "restored": [],
        "errors": {},
        "chat_smoke": "nicht ausgefuehrt",
    }
    if not isinstance(index, list) or not index:
        report["errors"]["index"] = "Publish-Index fehlt oder ist leer"
        return report

    ledger = _load_rotation(store)
    by_qid = {record.get("wikidata_qid"): record for record in index if record.get("wikidata_qid")}

    # Phase 1 (optional im Normalmodus): Extraktions-Budget fuer Profile, deren
    # Orte Wikidata nicht liefert — nur wenn das eigene Modell erreichbar ist.
    planned: list[dict] = []
    extraction_quota = 0 if (llm_post is None or only_incomplete) else extraction_budget
    if extraction_quota:
        candidates = []
        for record in select_records(index, ledger, limit=len(index)):
            entry = ledger.get(record.get("wikidata_qid"))
            attempts = entry.get("attempts") or 0 if isinstance(entry, dict) else 0
            if (not record.get("birth_place") or not record.get("death_place")) \
                    and attempts < MAX_MODEL_ATTEMPTS:
                candidates.append(record)
        planned.extend(candidates[:extraction_quota])
    # Phase 2: normale Rotation (im only-incomplete-Modus mit erhoehtem Limit).
    selected = select_records(index, ledger, limit=limit, only_incomplete=only_incomplete)
    planned.extend(selected)
    seen: set[str] = set()
    ordered: list[dict] = []
    for record in planned:
        qid = record.get("wikidata_qid")
        if qid in seen:
            continue
        seen.add(qid)
        ordered.append(record)

    resolver = PlaceResolver(lambda q: _load_entity(store, q, dry_run=dry_run))
    checked_at = now.isoformat()
    index_updates: dict[str, dict[str, str]] = {}

    for record in ordered:
        qid = record.get("wikidata_qid")
        if not qid:
            continue
        try:
            entity = _load_entity(store, qid, dry_run=dry_run)
            findings = audit_record(record, entity)
            updates: dict[str, str] = {}
            updates.update(place_fills_from_entity(entity, record, resolver))
            updates.update(date_fills_from_entity(entity, record))
            updates.update(label_fixes_from_entity(entity, record))

            missing_places = not record.get("birth_place") or not record.get("death_place")
            unresolved_after_wikidata = missing_places and not any(
                field in updates for field, _ in PLACE_FIELDS
            )
            if unresolved_after_wikidata and llm_post is not None:
                entry = ledger.get(qid)
                attempts = (entry.get("attempts") or 0) if isinstance(entry, dict) else 0
                if attempts >= MAX_MODEL_ATTEMPTS:
                    report["model_attempts_skipped"].append(qid)
                else:
                    research_doc = _get_json_object(store, f"{RESEARCH_PREFIX}{qid}.json")
                    texts = _source_texts(store, qid, fetch_json, research_doc or {})
                    extracted = extract_places_via_model(
                        llm_post,
                        name=str(record.get("name") or ""),
                        birth_year=str(record.get("birth_date") or "")[:4] or None,
                        death_year=str(record.get("death_date") or "")[:4] or None,
                        texts=texts,
                    )
                    if extracted:
                        for field, value in extracted.items():
                            updates.setdefault(field, value)
                        report["model_extractions"][qid] = extracted

            if findings["contradictions"]:
                report["contradictions"][qid] = findings["contradictions"]
            if findings["needs_rebuild"]:
                report["needs_rebuild"].append(qid)

            report["checked"].append(qid)
            if updates:
                allowed = {field: value for field, value in updates.items() if field in WRITABLE_FIELDS}
                if not dry_run:
                    before = _get_json_object(store, _profile_key(qid))
                    if isinstance(before, dict):
                        before.update(allowed)
                        _put_json_object(store, _profile_key(qid), before)
                        problem = _verify_written_profile(
                            store, qid, before=before, expected_updates=allowed
                        )
                        if problem:
                            report["restored"].append(qid)
                            report["errors"][qid] = problem
                            continue
                # Merge-Vorschrift je Feld: Fill (Altwert leer) oder bewusste
                # Label-Ersetzung (Altwert muss noch genau so stehen).
                index_updates[qid] = {
                    field: (record.get(field), value) for field, value in allowed.items()
                }
                report["changed"][qid] = allowed
            prior = ledger.get(qid)
            prior_attempts = prior.get("attempts") or 0 if isinstance(prior, dict) else 0
            ledger[qid] = {
                "checked_at": checked_at,
                "attempts": int(prior_attempts) + (1 if (missing_places and llm_post is not None) else 0),
            }
        except Exception as error:  # noqa: BLE001 - einzelne Profile brechen nicht ab
            report["errors"][qid] = f"{type(error).__name__}: {error}"

    # Chat-Rauchprobe: das eigene Modell muss je Lauf lebendig antworten
    # (dasselbe Modell versorgt auch den Live-Chat) — ein Wort genuegt.
    if llm_post is not None and smoke_model:
        try:
            answer = (llm_post("Antworte mit genau einem Wort: Funktionierst du?") or "").strip()
            report["chat_smoke"] = "ok" if answer else "leere Antwort"
        except Exception as error:  # noqa: BLE001 - eine Smoke-Probe bricht nichts ab
            report["chat_smoke"] = f"fehlerhaft ({type(error).__name__}: {error})"

    report["duplicates"] = find_duplicates(index)

    if not dry_run:
        # Index-PUT mit Konflikt-Schutz: frisch laden und je Feld pruefen, dass
        # der Wert seit dem Lauf unverändert ist — Fills nur auf leere Felder,
        # Label-Ersetzungen nur gegen denselben Altwert. Feldweise gewinnt die
        # frischere Fassung, nie rückwärts.
        if index_updates:
            fresh = _get_json_object(store, PUBLISH_INDEX_KEY)
            if not isinstance(fresh, list):
                fresh = index
            applied: dict[str, dict[str, str]] = {}
            for entry in fresh:
                qid = entry.get("wikidata_qid")
                updates = index_updates.get(qid)
                if not updates:
                    continue
                used: dict[str, str] = {}
                for field, (old, new) in updates.items():
                    current = entry.get(field)
                    if old is None and not current:
                        entry[field] = new
                        used[field] = new
                    elif old is not None and current == old:
                        entry[field] = new
                        used[field] = new
                if used:
                    applied[qid] = used
            _put_json_object(store, PUBLISH_INDEX_KEY, fresh)
            report["changed"] = applied
        ledger_subset = {qid: ledger[qid] for qid in {r.get("wikidata_qid") for r in ordered} if qid in ledger}
        merged_ledger = _load_rotation(store)
        merged_ledger.update(ledger_subset)
        _put_json_object(store, ROTATION_KEY, merged_ledger)
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        _put_json_object(store, REPORT_KEY, report)
        store.save_changelog(run_date, report, suffix="-profile-doctor")

    report["changed_slugs"] = sorted({
        str(by_qid.get(qid, {}).get("slug") or "")
        for qid in report.get("changed", {})
        if by_qid.get(qid, {}).get("slug")
    })
    return report


def render_summary(report: dict) -> str:
    """Markdown-Zusammenfassung fuer die GitHub-Step-Summary."""
    lines = [
        "### Profil-Doktor",
        f"- Geprüft: **{len(report.get('checked', []))}** Profile"
        f" (Index gesamt: {report.get('total_index', 0)})",
        f"- Korrigiert/ergänzt: **{len(report.get('changed', {}))}** Profile",
        f"- Eigene-Modell-Extraktionen: **{len(report.get('model_extractions', {}))}**",
        f"- Widersprüche (nur Bericht): **{len(report.get('contradictions', {}))}**",
        f"- Dubletten-Verdachte (nur Bericht): **{len(report.get('duplicates', []))}**",
        f"- Rebuild-Empfehlungen: **{len(report.get('needs_rebuild', []))}**",
        f"- Fehler: **{len(report.get('errors', {}))}**",
        f"- Chat-Rauchprobe (eigenes Modell): **{report.get('chat_smoke', 'n/a')}**",
    ]
    if report.get("dry_run"):
        lines.append("- Modus: **Vorschau (dry-run)** — es wurde nichts geschrieben.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Profil-Doktor (Bestands-Qualität 24/7)")
    parser.add_argument("--limit", type=int, default=250)
    parser.add_argument("--only-incomplete", action="store_true",
                        help="nur Profile mit fehlenden Orts-/Datumsfeldern prüfen")
    parser.add_argument("--extraction-budget", type=int, default=40,
                        help="max. Modell-Extraktionen je Lauf")
    parser.add_argument("--no-model", action="store_true",
                        help="Modell-Extraktion deaktivieren (nur Wikidata-Snapshots)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    parser.add_argument("--summary-file", default=None,
                        help="Markdown-Zusammenfassung zusaetzlich in diese Datei schreiben")
    parser.add_argument("--changed-file", default=None,
                        help="geaenderte Slugs (eine je Zeile) in diese Datei schreiben")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    llm_post = None if args.no_model else build_default_llm_post()
    report = run_doctor(
        store=store,
        limit=args.limit,
        dry_run=args.dry_run,
        run_date=date.today(),
        only_incomplete=args.only_incomplete,
        extraction_budget=args.extraction_budget,
        llm_post=llm_post,
    )
    print(json.dumps({key: report[key] for key in (
        "checked", "changed", "model_extractions", "contradictions", "duplicates", "errors",
    )}, ensure_ascii=False))
    if args.summary_file:
        with open(args.summary_file, "w", encoding="utf-8") as handle:
            handle.write(render_summary(report))
    if args.changed_file:
        with open(args.changed_file, "w", encoding="utf-8") as handle:
            for slug in report.get("changed_slugs", []):
                handle.write(f"{slug}\n")
    # Einzelne Profil-Fehler (Netz, fehlende Snapshots) sind normal und werden
    # im Bericht/Changelog protokolliert — nur indexweite oder mehrheitliche
    # Fehler lassen den Lauf scheitern (Health-Signal, kein Dauerfeuer).
    errors = report["errors"]
    if "index" in errors:
        return 1
    if len(errors) > max(5, len(report["checked"])):
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
