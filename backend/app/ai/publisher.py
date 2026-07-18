"""Publish-Logik der smyst.com Autopilot-Pipeline (Schritt 7, Domain).

Baut aus einer freigegebenen Twin Capsule den oeffentlichen Publish-Record,
pflegt den Publish-Index (Quelle fuer die statische CDN-API und die Sitemap)
und erzeugt das Sitemap-Fragment. Kein Netzwerk, kein Speicher.

Grundregeln (Master Prompt):
- Veroeffentlichung NUR mit menschlicher Freigabe (actor Pflicht, kommt vom Runner).
- Unpublish statt Loeschen: Records bleiben erhalten, Sichtbarkeit faellt.
- Alles reproduzierbar: Record referenziert Capsule, Quellen und Risiko-Stand.
"""

from __future__ import annotations

import unicodedata
from datetime import datetime, timezone

PUBLISH_INDEX_KEY = "pipeline/published/index.json"
SITEMAP_FRAGMENT_KEY = "pipeline/published/sitemap-fragment.json"


def _n(text: str) -> str:
    out = unicodedata.normalize("NFKD", text)
    out = "".join(ch for ch in out if not unicodedata.combining(ch))
    return " ".join(out.casefold().split())


def build_publish_record(
    candidate_doc: dict,
    capsule_doc: dict,
    *,
    approved_by: str,
    now: datetime | None = None,
) -> dict:
    """Oeffentlicher Profil-Datensatz (API/Frontend-kompatibel, statisch servierbar)."""
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    seo = capsule_doc.get("seo") or {}
    image = capsule_doc.get("image") or {}
    return {
        "wikidata_qid": candidate_doc["wikidata_qid"],
        "twin_id": candidate_doc.get("twin_id") or capsule_doc.get("twin_id"),
        "slug": capsule_doc["slug"],
        "name": capsule_doc.get("name") or candidate_doc.get("name"),
        "category": candidate_doc.get("category"),
        "language_default": capsule_doc.get("language_default", "de"),
        "birth_date": candidate_doc.get("birth_date") or (seo.get("json_ld") or {}).get("birthDate"),
        "death_date": candidate_doc.get("death_date") or (seo.get("json_ld") or {}).get("deathDate"),
        "birth_label": candidate_doc.get("birth_label"),
        "death_label": candidate_doc.get("death_label"),
        # 4-Zeilen-Profilformat: Ort gehoert zu Zeile 2 bzw. 3.
        "birth_place": candidate_doc.get("birth_place"),
        "death_place": candidate_doc.get("death_place"),
        "description": (seo.get("json_ld") or {}).get("description"),
        "persona_prompt_key": candidate_doc.get("prompt_key"),
        "capsule_key": f"pipeline/capsules/{candidate_doc['wikidata_qid']}/capsule.json",
        "image": image,
        "seo": seo,
        "sources": capsule_doc.get("sources", []),
        "risk_score": candidate_doc.get("risk_score"),
        "risk_flags": candidate_doc.get("risk_flags"),
        "qa_passed": bool(candidate_doc.get("qa_passed")),
        "ai_disclosure": "KI-Rekonstruktion auf Basis oeffentlicher Quellen; nicht die echte Person.",
        "published_at": timestamp,
        "approved_by": approved_by,
        "visible": True,
        "version": 1,
    }


def upsert_index(index: list[dict], record: dict) -> list[dict]:
    """Publish-Index aktualisieren; Slug- und QID-Eindeutigkeit erzwingen."""
    qid = record["wikidata_qid"]
    slug = record["slug"]
    for existing in index:
        if existing.get("visible", True) and existing["wikidata_qid"] != qid:
            if existing["slug"] == slug or _n(existing.get("name", "")) == _n(record.get("name", "")):
                raise ValueError(
                    f"Index-Konflikt: '{record.get('name')}' kollidiert mit "
                    f"{existing['wikidata_qid']} ({existing['slug']})"
                )
    remaining = [entry for entry in index if entry["wikidata_qid"] != qid]
    return remaining + [record]


def mark_unpublished(index: list[dict], qid: str, *, reason: str, now: datetime | None = None) -> list[dict]:
    """Sichtbarkeit entziehen, Record und Historie erhalten (kein Loeschen)."""
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    found = False
    updated: list[dict] = []
    for entry in index:
        if entry["wikidata_qid"] == qid:
            found = True
            updated.append({**entry, "visible": False, "unpublished_at": timestamp,
                            "unpublish_reason": reason})
        else:
            updated.append(entry)
    if not found:
        raise ValueError(f"QID {qid} nicht im Publish-Index")
    return updated


def build_sitemap_fragment(index: list[dict]) -> dict:
    """Sitemap-Eintraege fuer alle sichtbaren Profile (Prerender/SEO-Pipeline)."""
    urls = [
        {
            "loc": f"https://smyst.com/twin/{entry['slug']}",
            "lastmod": entry.get("published_at", "")[:10],
        }
        for entry in sorted(index, key=lambda e: e["slug"])
        if entry.get("visible", True)
    ]
    return {"urls": urls, "count": len(urls)}


def visible_count_today(index: list[dict], *, today_iso: str) -> int:
    """Anzahl heutiger Veroeffentlichungen (Tageslimit-Pruefung)."""
    return sum(
        1
        for entry in index
        if entry.get("visible", True) and str(entry.get("published_at", "")).startswith(today_iso)
    )
