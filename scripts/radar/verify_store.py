#!/usr/bin/env python3
"""smyst radar — Schritt 2: Pruefen, vergleichen, versionieren, speichern.

Vergleicht Fundstuecke aus research.py mit der bestehenden Wissensbasis
(Object Brain radar/ bzw. lokaler Spiegel) und entscheidet:
neu / unverändert (bestätigt) / geändert (neue Version) / veraltet / verworfen.

Klare Zustandstrennung (Pflicht aus dem Auftrag):
found → analyzed → verified|rejected → stored|updated|outdated → rag_ready
→ used_in_answer. training_approved wird NIE automatisch gesetzt —
gespeichertes Wissen ist KEIN Nachweis fuer Modelltraining (das macht nur
die getrennte erste Schiene, Trainingsschiene/Retrain-Autopilot).

Aenderungen sind vollstaendig versioniert (alte+neue Version, Grund, Datum),
Rollback pro Eintrag moeglich (Eintragsdateien bleiben im Store liegen).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from research import _RELEVANCE_RULES as RELEVANCE_RULES, now_utc, today  # noqa: E402

#: Frische-Bewertung (Tage seit Veröffentlichung; None = unbekannt).
FRESH_STALE_DAYS = 30
FRESH_OUTDATED_DAYS = 180

#: RAG-Freigabe-Schwelle: geprueft UND vertrauenswuerdig UND ohne Injection-Verdacht.
RAG_MIN_TRUST = 3

#: Budgets (API-Aufrufe; Kosten bleiben 0 EUR — nur kostenlose Quellen).
DAILY_CALL_BUDGET = 200
MONTHLY_CALL_BUDGET = 3000
MAX_KNOWLEDGE_ENTRIES = 2000  # harte Obergrenze des Index (Spiegel behält Historie im Store)


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9äöüß]{3,}", (text or "").lower())}


def title_similarity(a: str, b: str) -> float:
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def relevance_of(finding: dict) -> tuple[str, str, int]:
    """Kategorie + Begruendung + Relevanzscore (0-3) regelbasiert ermitteln."""
    text = f"{finding.get('title', '')} {finding.get('summary', '')} {finding.get('extra', {}).get('', '')}"
    t = text.lower()
    best = ("allgemein", "Sonstige Meldung ohne klare Themen-Zuordnung", 0)
    for cat, label, keywords in RELEVANCE_RULES:
        hits = [k for k in keywords if k in t]
        score = min(3, len(hits))
        if score > best[2]:
            best = (cat, f"{label} (Treffer: {', '.join(hits[:5])})", score)
    return best


def freshness_of(published: str | None) -> tuple[str, int]:
    if not published:
        return ("unbekannt", 1)  # kein Datum: kennzeichnet, nicht verwerfen
    try:
        d = dt.date.fromisoformat(published[:10])
    except ValueError:
        return ("unbekannt", 1)
    age = (dt.date.today() - d).days
    if age < 0:
        age = 0
    if age > FRESH_OUTDATED_DAYS:
        return ("veraltet", 0)
    if age > FRESH_STALE_DAYS:
        return ("alt", 1)
    return ("aktuell", 2)


def trust_of(finding: dict) -> tuple[int, str]:
    trust = int(finding.get("source_trust", 3))
    reasons = [f"Quellklasse {finding.get('source_kind', '?')} (Basis {trust})"]
    if not finding.get("published"):
        trust = max(1, trust - 1)
        reasons.append("kein Veröffentlichungsdatum (−1)")
    if finding.get("source_kind") in ("api", "github", "rss-offiziell"):
        reasons.append("Primär-/Offizialquelle")
    return (min(5, max(1, trust)), "; ".join(reasons))


class RadarState:
    """Lokaler Spiegel des Wissensspeichers (Object Brain wird gespiegelt)."""

    def __init__(self, state_dir: pathlib.Path):
        self.dir = state_dir
        self.entries_dir = state_dir / "knowledge" / "entries"
        self.reports_dir = state_dir / "reports"
        self.entries_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = state_dir / "knowledge" / "index.json"
        self.index: dict = self._load(self.index_path, {
            "generated_at": now_utc(), "entries": [],
        })
        self.by_id: dict[str, dict] = {e["id"]: e for e in self.index.get("entries", [])}
        self.by_url: dict[str, str] = {}
        for e in self.by_id.values():
            u = e.get("url_normalized")
            if u:
                self.by_url.setdefault(u, e["id"])

    def _load(self, path: pathlib.Path, default):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return default

    def budget(self) -> dict:
        b = self._load(self.dir / "budget.json", {"days": {}, "months": {}})
        day = b["days"].get(today(), {"api_calls": 0})
        month = b["months"].get(today()[:7], {"api_calls": 0})
        return {"day": day, "month": month,
                "daily_limit": DAILY_CALL_BUDGET, "monthly_limit": MONTHLY_CALL_BUDGET}

    def control(self) -> dict:
        return self._load(self.dir / "control.json",
                          {"enabled": True, "note": "Notaus: enabled=false stoppt Recherche-Läufe."})

    def find_duplicate(self, finding: dict) -> dict | None:
        hit = self.by_url.get(finding.get("url_normalized", ""))
        if hit:
            return self.by_id[hit]
        best, best_sim = None, 0.0
        title = finding.get("title", "")
        for e in self.by_id.values():
            sim = title_similarity(title, e.get("title", ""))
            if sim > best_sim:
                best, best_sim = e, sim
        if best is not None and best_sim >= 0.7 and len(tokenize(title)) >= 4:
            return best
        return None

    def save_entry(self, entry: dict):
        (self.entries_dir / f"{entry['id']}.json").write_text(
            json.dumps(entry, ensure_ascii=False, indent=1), encoding="utf-8")
        self.by_id[entry["id"]] = entry

    def write_index(self):
        entries = sorted(self.by_id.values(),
                         key=lambda e: e.get("retrieved", ""), reverse=True)[:MAX_KNOWLEDGE_ENTRIES]
        self.index = {"generated_at": now_utc(), "entries": entries}
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        self.index_path.write_text(json.dumps(self.index, ensure_ascii=False, indent=1),
                                   encoding="utf-8")

    def write_status(self, extra: dict):
        rag_ready = [e for e in self.by_id.values() if e.get("status") == "rag_ready"]
        status = {
            "updated_at": now_utc(),
            "autopilot": "smyst radar",
            "state": extra.get("state", "wartet"),
            "total_entries": len(self.by_id),
            "verified_entries": sum(1 for e in self.by_id.values() if e.get("check") == "verified"),
            "rejected_entries": sum(1 for e in self.by_id.values() if e.get("check") == "rejected"),
            "outdated_entries": sum(1 for e in self.by_id.values() if e.get("freshness") == "veraltet"),
            "rag_ready_entries": len(rag_ready),
            "used_in_answer_entries": sum(1 for e in self.by_id.values() if e.get("used_in_answer")),
            "training_approved_entries": sum(1 for e in self.by_id.values()
                                             if e.get("training_approved") is True),
            "budget": self.budget(),
            "enabled": self.control().get("enabled", True),
            **extra,
        }
        (self.dir / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=1),
                                              encoding="utf-8")

    def add_budget(self, api_calls: int):
        b = self._load(self.dir / "budget.json", {"days": {}, "months": {}})
        d = b["days"].setdefault(today(), {"api_calls": 0})
        m = b["months"].setdefault(today()[:7], {"api_calls": 0})
        d["api_calls"] += api_calls
        m["api_calls"] += api_calls
        (self.dir / "budget.json").write_text(json.dumps(b, ensure_ascii=False, indent=1),
                                              encoding="utf-8")


def status_step(entry: dict, new_status: str, reason: str):
    entry.setdefault("status_history", []).append({
        "at": now_utc(), "from": entry.get("status", "found"), "to": new_status, "reason": reason,
    })
    entry["status"] = new_status


def build_entry(finding: dict) -> dict:
    category, relevance_reason, relevance_score = relevance_of(finding)
    trust, trust_reason = trust_of(finding)
    fresh, fresh_score = freshness_of(finding.get("published"))
    injection = bool(finding.get("injection_suspicion"))

    rejected_reason = None
    if injection:
        rejected_reason = "Verdacht auf versteckte Anweisungen (Prompt Injection) — Inhalt nur archiviert, keine Nutzung."
    elif relevance_score == 0:
        rejected_reason = "Keine erkennbare Relevanz für smyst-Themenfelder."
    elif trust < 3:
        rejected_reason = "Vertrauensniveau zu niedrig."

    entry = {
        "id": finding["id"],
        "title": finding["title"],
        "topic": {"category": category, "reason": relevance_reason,
                  "relevance_score": relevance_score},
        "summary": finding["summary"],
        "key_points": [s.strip() for s in finding["summary"].split(". ") if s.strip()][:5],
        "source": {"id": finding["source_id"], "name": finding["source_name"],
                   "kind": finding["source_kind"], "trust": trust, "trust_reason": trust_reason},
        "source_url": finding["url"],
        "url_normalized": finding["url_normalized"],
        "publisher": finding["publisher"],
        "published": finding.get("published"),
        "retrieved": finding["retrieved"],
        "check": "rejected" if rejected_reason else "verified",
        "check_reason": rejected_reason or (
            f"Regelprüfung bestanden: Relevanz {relevance_score}/3, Vertrauen {trust}/5, "
            f"Aktualität {fresh}"),
        "trust_level": trust,
        "freshness": fresh,
        "injection_suspicion": finding.get("injection_suspicion", []),
        "contradiction_candidates": [],
        "tags": [category, finding["source_kind"], fresh],
        "relevance_smyst": relevance_score,
        "usage_status": "gespeichert-geprüft" if not rejected_reason else "abgelehnt",
        "used_in_answer": False,
        "rag_used_count": 0,
        "training_approved": False,  # NIE automatisch — Inhaber-Freigabe vorbehalten
        "versions": [{
            "version": 1, "date": now_utc(),
            "reason": "Erstfund durch smyst radar",
            "previous": None, "current": {"title": finding["title"], "summary": finding["summary"]},
        }],
        "status_history": [],
        "status": "found",
    }
    status_step(entry, "analyzed", "Kategorisiert und regelbasiert bewertet.")
    status_step(entry, "rejected" if rejected_reason else "verified",
                rejected_reason or "Prüfung bestanden (Vertrauen/Relevanz/Aktualität).")
    status_step(entry, "stored" if not rejected_reason else "archiviert-als-abgelehnt",
                "In Wissensbasis gespeichert." if not rejected_reason
                else "Nur zu Berichtszwecken archiviert, nicht nutzbar.")
    if not rejected_reason and trust >= RAG_MIN_TRUST and not injection:
        status_step(entry, "rag_ready", "Für RAG-Abruf freigegeben (geprüft, vertrauenswürdig).")
    return entry


def update_entry(existing: dict, finding: dict) -> tuple[dict, str]:
    """Bestehenden Eintrag aktualisieren: bestaetigen, veraendern oder veralten."""
    old_summary = existing.get("summary", "")
    old_title = existing.get("title", "")
    changed_fields = []
    if finding["summary"] and finding["summary"] != old_summary:
        changed_fields.append("summary")
    if finding["title"] and finding["title"] != old_title:
        changed_fields.append("title")
    new_fresh, _ = freshness_of(finding.get("published"))

    existing["last_seen"] = now_utc()
    existing["confirmations"] = existing.get("confirmations", 0) + 1

    if new_fresh == "veraltet" and existing.get("freshness") != "veraltet":
        existing["freshness"] = "veraltet"
        status_step(existing, "outdated", "Veröffentlichungsdatum deutlich veraltet.")
        existing["versions"].append({
            "version": len(existing["versions"]) + 1, "date": now_utc(),
            "reason": "Als veraltet markiert", "previous": {"freshness": "aktuell/alt"},
            "current": {"freshness": "veraltet"},
        })
        return existing, "outdated"

    if changed_fields:
        # Unterschiedliche Quellen berichten dasselbe Ereignis leicht anders:
        # das ist eine BESTAETIGUNG (mehrere unabhaengige Quellen), keine
        # inhaltliche Aenderung derselben Quelle.
        if set(changed_fields) == {"summary"} and existing.get("publisher") != finding.get("publisher"):
            existing.setdefault("confirming_sources", []).append({
                "publisher": finding.get("publisher"), "url": finding.get("url"),
                "at": now_utc(),
            })
            status_step(existing, "stored", "Durch zweite Quelle bestätigt (kein neuer Eintrag).")
            return existing, "confirmed"
        prev = {f: (old_summary if f == "summary" else old_title) for f in changed_fields}
        curr = {f: (finding["summary"] if f == "summary" else finding["title"]) for f in changed_fields}
        existing["versions"].append({
            "version": len(existing["versions"]) + 1, "date": now_utc(),
            "reason": f"Inhaltliche Änderung der Quelle: {', '.join(changed_fields)}",
            "previous": prev, "current": curr,
        })
        if "summary" in changed_fields:
            existing["summary"] = finding["summary"]
            existing["key_points"] = [s.strip() for s in finding["summary"].split(". ") if s.strip()][:5]
        if "title" in changed_fields:
            existing["title"] = finding["title"]
        if existing.get("status") == "outdated" and new_fresh != "veraltet":
            existing["freshness"] = new_fresh
            status_step(existing, "updated", "Neue Version der Information eingetroffen.")
        else:
            status_step(existing, "updated", f"Quelle aktualisiert ({', '.join(changed_fields)}).")
        return existing, "updated"

    status_step(existing, "stored", "Unverändert bestätigt (kein neuer Eintrag erzeugt).")
    return existing, "confirmed"


def find_contradiction_candidates(state: RadarState, entry: dict) -> list[str]:
    """Heuristik: gleiche Kategorie + aehnlicher Titel, aber differentes Datum/Version."""
    cands = []
    for e in state.by_id.values():
        if e["id"] == entry["id"] or e.get("topic", {}).get("category") != entry.get("topic", {}).get("category"):
            continue
        sim = title_similarity(entry.get("title", ""), e.get("title", ""))
        if 0.3 <= sim < 0.6 and e.get("published") != entry.get("published"):
            cands.append(e["id"])
    return cands[:3]


def improvement_suggestions(new_verified: list[dict]) -> list[dict]:
    """Priorisierte, regelbasiert abgeleitete Verbesserungsvorschlaege (KEINE Automatik)."""
    suggestions = []
    for e in sorted(new_verified, key=lambda x: -(x.get("trust_level", 0) * (x.get("relevance_smyst", 0) + 1))):
        cat = e.get("topic", {}).get("category")
        if cat == "sicherheit":
            what = "Betroffene Komponenten (llama.cpp, Abhängigkeiten, Hosting) gegen die neue Schwachstelle prüfen und Patch-Stand bewerten."
            test = "Versionsabgleich vor/nach Patch; Smoke-Tests (providers ping, Gast-Chat)."
        elif cat == "infrastruktur":
            what = "Neue Infrastruktur-Version (z. B. llama.cpp) auf Kompatibilität und Nutzen für smyst.com bewerten."
            test = "Lokaler Benchmark alt/neu (Antwortzeit, Token/s) vor jedem Upgrade."
        elif cat in ("digitale-zwillinge", "ki-modelle", "konkurrenz"):
            what = "Erkanntes Konkurrenz-/Modell-Feature als mögliche smyst.com-Verbesserung bewerten."
            test = "Nutzertest mit/ohne Feature; Chat-Qualität (Eval) vorher/nachher vergleichen."
        elif cat == "forschung":
            what = "Forschungsergebnis (z. B. Memory/RAG) auf Anwendbarkeit für die Wissensbasis prüfen."
            test = "RAG-Testfragen vorher/nachher (Trefferqualität) vergleichen."
        else:
            continue
        suggestions.append({
            "title": what,
            "problem": f"Neue Erkenntnis aus Kategorie '{cat}': {e['title'][:120]}",
            "sources": [e["source_url"]] if e.get("source_url") else [],
            "observations": e.get("key_points", [])[:2],
            "benefit": "Qualität, Sicherheit oder Attraktivität von smyst.com kann steigen.",
            "affected_areas": ["Backend", "Modelle", "Admin"] if cat in ("sicherheit", "infrastruktur") else ["Produkt", "Chat"],
            "costs": "0 EUR Planziel — Free-Only-Regel; kostenpflichtige Wege sind nicht vorgeschlagen.",
            "risks": "Änderungsrisiko besteht — deshalb nur Vorschlag, Umsetzung ausschließlich über separates Prüf-/Freigabeverfahren.",
            "privacy_risks": "Keine Nutzerdaten betroffen (Recherche nutzt nur öffentliche Quellen).",
            "test": test,
            "metrics_before_after": ["Antwortzeit Chat", "Eval-Score", "RAG-Trefferqualität", "Fehlerrate"],
            "priority": e.get("trust_level", 0) * (e.get("relevance_smyst", 0) + 1),
            "entry_id": e["id"],
        })
        if len(suggestions) >= 5:
            break
    return suggestions


def main() -> int:
    ap = argparse.ArgumentParser(description="smyst radar Pruef-/Speicher-Schritt")
    ap.add_argument("--research", default="radar-out/research.json")
    ap.add_argument("--state-dir", default="radar-state")
    ap.add_argument("--api-calls", type=int, default=0, help="Verbrauchte Aufrufe des Laufs")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        ok = True
        ok &= title_similarity("Neues Qwen Modell erschienen", "Neues Qwen Modell veröffentlicht") > 0.6
        ok &= title_similarity("Sicherheitslücke in Linux", "Neuer Gartenzaun") < 0.2
        ok &= freshness_of(None)[0] == "unbekannt"
        ok &= freshness_of("2020-01-01")[0] == "veraltet"
        f = {"source_trust": 5, "published": today(), "source_kind": "api"}
        ok &= trust_of(f)[0] == 5
        print("SELFTEST verify_store.py:", "OK" if ok else "FEHLER")
        return 0 if ok else 1

    state = RadarState(pathlib.Path(args.state_dir))
    research = json.loads(pathlib.Path(args.research).read_text(encoding="utf-8"))
    control = state.control()
    budget = state.budget()

    report = {
        "title": "Was hat smyst radar heute dazugelernt?",
        "day": research.get("day", today()),
        "generated_at": now_utc(),
        "paused": False,
        "topics_researched": [], "topics_reasons": [],
        "sources_examined": research.get("sources_checked", []),
        "sources_examined_count": len(research.get("sources_checked", [])),
        "sources_ok_count": sum(1 for s in research.get("sources_checked", []) if s.get("ok")),
        "findings_count": len(research.get("findings", [])),
        "new_insights": [], "confirmed": [], "updated": [], "corrected": [],
        "outdated": [], "rejected": [], "contradictions": [],
        "competitor_changes": [], "new_models_tech": [], "security_findings": [],
        "improvement_suggestions": [], "rag_usage": [], "open_questions": [],
        "further_research": [], "errors": research.get("usage", {}).get("errors", 0),
        "costs": {"last_run_eur": 0.0, "day_eur": 0.0, "month_eur": 0.0,
                  "note": "Ausschließlich kostenlose offizielle Quellen/APIs (Free-Only-Regel)."},
    }

    if not control.get("enabled", True):
        report["paused"] = True
        report["summary"] = ("smyst radar ist durch den Notaus (control.json enabled=false) "
                             "pausiert. Kein Recherchelauf, kein Lernerfolg.")
        state.write_status({"state": "pausiert", "last_report": report["day"]})
        out = state.reports_dir / f"{report['day']}.json"
        out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        print("Radar pausiert (Notaus) — Bericht geschrieben.")
        return 0

    over_budget = (budget["day"]["api_calls"] + args.api_calls > budget["daily_limit"]
                   or budget["month"]["api_calls"] + args.api_calls > budget["monthly_limit"])
    if over_budget:
        report["paused"] = True
        report["summary"] = ("Tages-/Monatsbudget an API-Aufrufen erschöpft — keine weiteren "
                             "kostenpflichtigen Risiken, Lauf uebersprungen.")
        state.write_status({"state": "budget-pausiert", "last_report": report["day"]})
        (state.reports_dir / f"{report['day']}.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        print("Budget erschöpft — pausiert.")
        return 0

    findings = research.get("findings", [])
    dedupe_seen_titles: list[str] = []
    new_verified_entries: list[dict] = []
    for f in findings:
        dup = state.find_duplicate(f)
        if dup is not None:
            entry, outcome = update_entry(dup, f)
            state.save_entry(entry)
            if outcome == "outdated":
                report["outdated"].append({"id": entry["id"], "title": entry["title"]})
            elif outcome == "updated":
                report["updated"].append({"id": entry["id"], "title": entry["title"],
                                          "changed": [v["reason"] for v in entry["versions"][-1:]]})
            else:
                report["confirmed"].append({"id": entry["id"], "title": entry["title"]})
            continue

        entry = build_entry(f)
        sim_titles = [t for t in dedupe_seen_titles if title_similarity(f.get("title", ""), t) >= 0.6]
        if sim_titles:
            continue  # innerhalb des Laufs bereits verarbeitet
        dedupe_seen_titles.append(f.get("title", ""))

        cands = find_contradiction_candidates(state, entry)
        if cands:
            entry["contradiction_candidates"] = cands
            report["contradictions"].append({
                "entry_id": entry["id"], "title": entry["title"],
                "candidates": cands,
                "note": "Ähnliche Titel, unterschiedliches Datum — manuelle Gegenprüfung empfohlen (Kennzeichnung, keine automatische Entscheidung).",
            })
        state.save_entry(entry)
        if entry["check"] == "verified":
            new_verified_entries.append(entry)
            report["new_insights"].append({
                "id": entry["id"], "title": entry["title"],
                "category": entry["topic"]["category"], "trust": entry["trust_level"],
                "freshness": entry["freshness"], "url": entry["source_url"],
            })
        else:
            report["rejected"].append({
                "id": entry["id"], "title": entry["title"], "reason": entry["check_reason"],
            })

    for f_source in research.get("sources_checked", []):
        if f_source["source_id"] not in {s["source_id"] for s in report["topics_researched"]}:
            src = next((s for s in research.get("sources_checked", [])
                        if s["source_id"] == f_source["source_id"]), None)
            reason = next((r for r in _preset_reasons() if r["id"] == f_source["source_id"]), "")
            report["topics_researched"].append(src)
            report["topics_reasons"].append(reason)

    for e in new_verified_entries:
        cat = e["topic"]["category"]
        if cat == "konkurrenz":
            report["competitor_changes"].append({"id": e["id"], "title": e["title"]})
        if cat in ("ki-modelle", "infrastruktur", "forschung"):
            report["new_models_tech"].append({"id": e["id"], "title": e["title"]})
        if cat == "sicherheit":
            report["security_findings"].append({"id": e["id"], "title": e["title"]})

    report["improvement_suggestions"] = improvement_suggestions(new_verified_entries)
    report["further_research"] = [
        "Widerspruchskandidaten manuell gegenprüfen (siehe contradictions).",
        "Quellen ohne Datum nach Primärquelle durchsuchen.",
    ] if report["contradictions"] else ["Aktuell keine besonderen offenen Recherchethemen."]
    report["open_questions"] = [] if new_verified_entries else [
        "Heute keine ausreichend relevanten und geprüften neuen Erkenntnisse gefunden."
    ]
    report["summary"] = (
        f"{len(report['new_insights'])} neue geprüfte Erkenntnisse, "
        f"{len(report['confirmed'])} bestätigt, {len(report['updated'])} aktualisiert, "
        f"{len(report['outdated'])} veraltet, {len(report['rejected'])} verworfen."
        if new_verified_entries or report["confirmed"] or report["rejected"] else
        "Heute wurden keine ausreichend relevanten und geprüften neuen Erkenntnisse gefunden."
    )

    state.add_budget(args.api_calls)
    state.write_index()
    state.write_status({
        "state": "wartet",
        "last_run": research.get("run_at"),
        "last_run_findings": len(findings),
        "last_run_new_insights": len(report["new_insights"]),
        "last_run_rejected": len(report["rejected"]),
        "last_report": report["day"],
    })
    out = state.reports_dir / f"{report['day']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Prüfung fertig: {report['summary']}")
    print(f"Bericht: {out}")
    return 0


def _preset_reasons() -> list[dict]:
    from research import SOURCES
    return [{"id": s["id"], "reason": s["reason"]} for s in SOURCES]


if __name__ == "__main__":
    raise SystemExit(main())
