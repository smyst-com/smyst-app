"""Admin-Endpoints fuer das Autopilot-Cockpit (Stufe 1).

GET /api/admin/overview   – Infrastruktur-Status (Storage/Compute-Plan) plus
                             ehrliche Kernzahlen (Feedback-Volumen).
GET /api/admin/autopilot  – Ampel-Status aller geplanten Autopilot-Workflows
                             (GitHub Actions) und der lokalen launchd-Jobs.

Beide Endpunkte sind read-only und nur fuer Sessions mit admin:read
(Rollen admin/owner) erreichbar – gleiche Regel wie /api/admin/quality.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.v1.routes.admin_quality import _require_admin
from app.integrations import feedback_store

router = APIRouter(prefix="/admin", tags=["admin"])

#: GitHub-Repository mit den Workflows. Ueberschreibbar per Env, damit
#: Forks/Tests nicht gegen das Produktions-Repo laufen.
GITHUB_REPO = os.getenv("SMYST_GITHUB_REPOSITORY", "smyst-com/smyst-app")
GITHUB_API = "https://api.github.com"

#: Cache: der Autopilot-Status aendert sich minutenweise, nicht sekundenweise.
AUTOPILOT_CACHE_TTL_SECONDS = 300
_autopilot_cache: dict[str, Any] = {"fetchedAt": 0.0, "payload": None}

#: Die geplanten Autopilot-Workflows (Datei in .github/workflows/, Takt,
#: erwartetes Intervall in Stunden fuer die Ampel-Bewertung).
AUTOPILOT_WORKFLOWS: list[dict[str, Any]] = [
    {"file": "pipeline-run.yml", "name": "Profil-Pipeline", "cadence": "8x/Tag", "intervalHours": 3},
    {"file": "pipeline-scale-2k.yml", "name": "Scale-2k-Batch", "cadence": "alle 2 h", "intervalHours": 2},
    {"file": "pipeline-watchdog.yml", "name": "Pipeline-Watchdog", "cadence": "stündlich", "intervalHours": 1},
    {"file": "quality-loop.yml", "name": "Quality-Loop", "cadence": "2x/Tag", "intervalHours": 12},
    {"file": "quality-autopilot.yml", "name": "Quality-Autopilot", "cadence": "täglich", "intervalHours": 24},
    {"file": "eval.yml", "name": "Chat-Eval", "cadence": "täglich", "intervalHours": 24},
    {"file": "model-eval.yml", "name": "Modell-Eval", "cadence": "täglich", "intervalHours": 24},
    {"file": "voice-qa-daily.yml", "name": "Sprach-QA", "cadence": "täglich", "intervalHours": 24},
    {"file": "pipeline-backup.yml", "name": "Backup", "cadence": "täglich", "intervalHours": 24},
    {"file": "perf-measure.yml", "name": "Performance-Messung", "cadence": "wöchentlich", "intervalHours": 168},
]

#: Lokale launchd-Autopiloten auf der Mac-Workstation – vom Server aus nicht
#: abfragbar, werden daher als "lokal" ohne Ampel gelistet.
AUTOPILOT_LOCAL: list[dict[str, Any]] = [
    {"file": "com.smyst.retrain-autopilot", "name": "Modell-Retraining", "cadence": "sonntags 11:00"},
    {"file": "com.smyst.autopilot-watchdog", "name": "Autopilot-Watchdog", "cadence": "täglich 12:30"},
]


def _settings() -> Any:
    from app.core.config import get_settings

    return get_settings()


async def _github_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("SMYST_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _run_fields(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "runId": run.get("id"),
        "status": run.get("status"),
        "conclusion": run.get("conclusion"),
        "createdAt": run.get("created_at"),
        "htmlUrl": run.get("html_url"),
    }


async def _latest_run_per_workflow(client: httpx.AsyncClient) -> dict[str, dict[str, Any]]:
    """Letzten Lauf je Workflow-Datei holen (ein Call pro Workflow, per_page=1).

    Der Liste-aller-Runs-Call reicht nicht: die haeufigen Jobs (Watchdog,
    Pipeline) verdraengen seltene Workflows aus den ersten 100 Eintraegen.
    """
    headers = await _github_headers()
    runs: dict[str, dict[str, Any]] = {}

    async def fetch(entry: dict[str, Any]) -> None:
        file = entry["file"]
        try:
            response = await client.get(
                f"{GITHUB_API}/repos/{GITHUB_REPO}/actions/workflows/{file}/runs",
                headers=headers,
                params={"per_page": 1},
            )
            if response.status_code != 200:
                return
            workflow_runs = response.json().get("workflow_runs") or []
            if workflow_runs:
                runs[file] = _run_fields(workflow_runs[0])
        except Exception:
            pass

    await asyncio.gather(*[fetch(entry) for entry in AUTOPILOT_WORKFLOWS])
    return runs


def _light(entry: dict[str, Any], run: dict[str, Any] | None, now: float) -> str:
    """Ampel: gruen = frisch erfolgreich, gelb = ueberfaellig, rot = fehlgeschlagen."""
    if run is None:
        return "unknown"
    if run.get("status") != "completed":
        return "green" if run.get("status") == "in_progress" else "unknown"
    if run.get("conclusion") not in ("success", None):
        return "red"
    created = run.get("createdAt")
    if not isinstance(created, str):
        return "green"
    try:
        from datetime import datetime

        ran_at = datetime.fromisoformat(created.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return "green"
    age_hours = (now - ran_at) / 3600
    return "green" if age_hours <= entry["intervalHours"] * 1.5 else "yellow"


async def _autopilot_payload() -> dict[str, Any]:
    now = time.time()
    cached = _autopilot_cache.get("payload")
    if cached and now - float(_autopilot_cache.get("fetchedAt", 0)) < AUTOPILOT_CACHE_TTL_SECONDS:
        return cached

    async with httpx.AsyncClient(timeout=10) as client:
        runs = await _latest_run_per_workflow(client)

    workflows: list[dict[str, Any]] = []
    for entry in AUTOPILOT_WORKFLOWS:
        run = runs.get(entry["file"])
        workflows.append(
            {
                **entry,
                "kind": "github",
                "light": _light(entry, run, now),
                "lastRun": run,
            }
        )
    for entry in AUTOPILOT_LOCAL:
        workflows.append({**entry, "kind": "local", "light": "unknown", "lastRun": None})

    known = [w for w in workflows if w["light"] != "unknown"]
    summary = {
        "total": len(workflows),
        "green": sum(1 for w in known if w["light"] == "green"),
        "yellow": sum(1 for w in known if w["light"] == "yellow"),
        "red": sum(1 for w in known if w["light"] == "red"),
        "unknown": sum(1 for w in workflows if w["light"] == "unknown"),
        "allGreen": bool(known) and all(w["light"] == "green" for w in known),
        "source": "github-api" if runs else "static",
        "repo": GITHUB_REPO,
    }
    payload = {"ok": True, "summary": summary, "workflows": workflows, "checkedAt": int(now * 1000)}
    _autopilot_cache["fetchedAt"] = now
    _autopilot_cache["payload"] = payload
    return payload


@router.get("/overview")
async def admin_overview(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied

    settings = _settings()
    storage_ready = bool(settings.idrive_e2_access_key and settings.idrive_e2_secret_key)
    salad_ready = bool(getattr(settings, "salad_api_key", None))

    records = await asyncio.to_thread(feedback_store.list_feedback, None, limit=500)
    down_count = sum(1 for record in records if record.get("rating") in ("down", "report"))

    return {
        "ok": True,
        "mode": settings.app_env,
        "metrics": {
            "feedbackTotal": len(records),
            "feedbackDownOrReport": down_count,
            "auditEvents": 0,
        },
        "storagePlan": {
            "metadata": "IDrive e2 (Object Brain)",
            "objects": "IDrive e2 – bereit" if storage_ready else "IDrive e2 – Keys fehlen",
            "compute": "Salad – bereit" if salad_ready else "Salad – nur bei Bedarf",
        },
        "computePlan": {
            "ready": salad_ready,
            "status": "ready" if salad_ready else "blocked",
            "mode": "on-demand",
            "primaryProvider": "salad",
            "streamingEnabled": salad_ready,
            "note": "Compute-Job-Pipeline laeuft ueber GitHub-Actions-Worker."
            if not salad_ready
            else None,
        },
        "computeQueue": {
            "total": 0,
            "queued": 0,
            "running": 0,
            "succeeded": 0,
            "failed": 0,
            "retryable": 0,
            "staleRunning": 0,
        },
    }


@router.get("/autopilot")
async def admin_autopilot(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied

    payload = await _autopilot_payload()
    return JSONResponse(content=payload)
