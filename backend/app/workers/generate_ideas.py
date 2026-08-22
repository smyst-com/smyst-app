"""Ideen-Autopilot (Stufe 3): schlaegt smyst.com-Verbesserungen vor.

Der Worker liest den Qualitaets-Report (Eval-Scores, Regressionen, offene
Reviews) plus die neuesten Kritik-Feedbacks und dem neuesten smyst-1.0-
Modell-Eval und bittet den LLM-Router um 1-3 kleine, konkrete Verbesserungs-
vorschlaege (JSON). Jede Idee landet als pipeline/ideas/{id}.json im Object
Brain mit Status 'proposed' – sichtbar im Admin-Bereich als Freigabe-Karte.

Schutzregeln: dieser Worker schreibt NUR pipeline/ideas/*, aendert keine
Profile, kein Code, kein Deployment. Ohne externen LLM-Provider beendet er
sich still (keine Not-Fallback-Ideen).

CLI:
    python -m app.workers.generate_ideas [--dry-run] [--limit 3]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import UTC, datetime
from typing import Any

IDEA_PREFIX = "pipeline/ideas/"
MODEL_EVAL_PREFIX = "training-evals/"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _idea_id(title: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    digest = hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]
    return f"{stamp}-{digest}"


def load_model_eval_latest(store: Any, limit: int = 3) -> list[dict[str, Any]]:
    """Neueste smyst-1.0-Eval-Reports (aggregate-Scores je Tag) lesen."""
    reports: list[dict[str, Any]] = []
    try:
        paginator = store._client.get_paginator("list_objects_v2")  # noqa: SLF001
        from app.core.config import settings

        pages = paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=MODEL_EVAL_PREFIX)
        keys = [obj["Key"] for page in pages for obj in page.get("Contents", [])]
        keys.sort(reverse=True)
        for key in keys[:limit]:
            obj = store._client.get_object(Bucket=settings.idrive_e2_bucket, Key=key)  # noqa: SLF001
            body = obj["Body"].read().decode("utf-8")
            report = json.loads(body)
            aggregate = report.get("aggregate") or {}
            reports.append(
                {
                    "key": key.rsplit("/", 1)[-1],
                    "tag": report.get("tag"),
                    "score": aggregate.get("score"),
                    "answered": aggregate.get("answered"),
                    "total": aggregate.get("total"),
                    "finished_at": report.get("finished_at"),
                }
            )
    except Exception:
        pass
    return reports


def build_prompt(summary: dict[str, Any], feedback_texts: list[str], model_reports: list[dict[str, Any]]) -> str:
    kritik = "\n".join(f"- {t}" for t in feedback_texts[:10]) or "- (keine Kritik-Feedbacks)"
    modelle = "\n".join(
        f"- {r.get('key')}: score={r.get('score')} ({r.get('answered')}/{r.get('total')} beantwortet)"
        for r in model_reports
    ) or "- (noch keine Modell-Evals)"
    return f"""Du bist der Ideen-Autopilot von smyst.com (Plattform fuer KI-Zwillinge historischer Persoenlichkeiten).

Aufgabe: Schlage 1 bis 3 KLEINE, konkret umsetzbare Verbesserungen vor, basierend auf diesen aktuellen Daten:

Qualitaets-Report (Eval-Scores, Regressionen):
{json.dumps(summary, ensure_ascii=False, default=str)[:2000]}

Neueste Kritik-Feedbacks von Nutzern:
{kritik}

smyst-1.0-Modell-Evals:
{modelle}

Regeln:
- Nur kleine, inkrementelle Verbesserungen (keine Redesigns, keine Paid-Services, keine Aenderungen am eingefrorenen Startseiten-Design oder Sprachsystem).
- Jede Idee muss in einem Satz sagbar sein, warum sie den Nutzern hilft.
- Antworte NUR mit JSON: {{"ideas": [{{"title": "...", "description": "...", "expected_benefit": "..."}}]}}"""


def _parse_ideas(raw: str) -> list[dict[str, str]]:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    ideas = []
    for entry in data.get("ideas", []):
        title = str(entry.get("title") or "").strip()[:120]
        description = str(entry.get("description") or "").strip()[:600]
        benefit = str(entry.get("expected_benefit") or "").strip()[:300]
        if title and description:
            ideas.append({"title": title, "description": description, "expected_benefit": benefit})
    return ideas


def generate_ideas(*, limit: int = 3, dry_run: bool = False) -> int:
    from app.ai.llm_router import LocalDeterministicProvider, build_default_router
    from app.ai.models import LLMRequest
    from app.integrations import feedback_store, quality_store
    from app.integrations.candidate_store import CandidateStore, build_s3_client
    from app.core.config import settings

    summary = quality_store.load_summary()
    records = feedback_store.list_feedback(None, limit=100)
    kritik = [
        f"{r.get('question', '')[:80]} -> {r.get('comment') or r.get('answer', '')[:120]}"
        for r in records
        if r.get("rating") in ("down", "report")
    ]
    store = CandidateStore(build_s3_client(), settings.idrive_e2_bucket)
    model_reports = load_model_eval_latest(store)

    router = build_default_router()
    external = [p for p in router.providers if not isinstance(p, LocalDeterministicProvider)]
    if not external:
        print("Kein externer LLM-Provider verfuegbar – keine Ideen (kein Not-Fallback).")
        return 0

    import asyncio

    response = asyncio.run(
        router.complete(
            LLMRequest(
                prompt=build_prompt(summary, kritik, model_reports),
                system_prompt="Du antwortest ausschliesslich mit validem JSON.",
                max_tokens=800,
                temperature=0.7,
            )
        )
    )
    if getattr(response, "degraded", False):
        print("LLM-Antwort degradiert – keine Ideen.")
        return 0

    ideas = _parse_ideas(response.text)[:limit]
    if not ideas:
        print("Keine gueltigen Ideen in der Antwort.")
        return 0

    created = []
    for idea in ideas:
        idea_id = _idea_id(idea["title"])
        doc = {
            "id": idea_id,
            **idea,
            "status": "proposed",
            "source": "ideas-autopilot",
            "created_at": _now_iso(),
            "decided_at": None,
            "decided_by": None,
            "decision_reason": None,
        }
        created.append(doc)
        print(f"- {idea_id}: {idea['title']}")
        if dry_run:
            continue
        store._client.put_object(  # noqa: SLF001
            Bucket=settings.idrive_e2_bucket,
            Key=f"{IDEA_PREFIX}{idea_id}.json",
            Body=json.dumps(doc, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
    print(f"{len(created)} Idee(n) {'(dry-run) ' if dry_run else ''}erzeugt.")
    return 0


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Ideen-Autopilot (Stufe 3)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args(argv)
    return generate_ideas(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
