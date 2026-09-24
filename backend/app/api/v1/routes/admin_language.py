"""Admin-API des smyst language autopilot (Mehrsprachigkeits-Auftrag 24.09.2026).

Endpunkte (nur fuer Sessions mit admin:read, gleiche Regel wie die anderen
Admin-Routen):
GET  /api/admin/language/autopilot        – Status, Abdeckung, Fehlerliste,
                                            Register-Zusammenfassung.
POST /api/admin/language/autopilot/toggle – Dienst ein-/ausschalten
                                            (persistent im Object Brain, mit
                                            Zeitstempel als Audit-Trail).
POST /api/admin/language/autopilot/run    – "Jetzt testen": ein begrenzter
                                            Lauf (Profil/Sprache/Funktion
                                            waehlbar) im Hintergrund-Thread.
                                            Veraendert den Ein-/Aus-Zustand
                                            NICHT (Auftrag: Einmaltests
                                            stellen den Ursprungszustand
                                            wieder her — hier nichts zu
                                            ruecksetzen, weil nicht geschaltet
                                            wird).

Der Hintergrundlauf nutzt dieselbe execute_run-Funktion wie der Cron-Worker
und respektiert die Lastkontrolle (Limit, Pausen). Er prueft gegen das
echte Live-Backend (api.smyst.com), niemals gegen Nutzerdaten.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.ai.language_register import register_summary
from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request
from app.integrations import language_report_store as store
from app.workers.language_autopilot import DEFAULT_BASE_URL, execute_run

logger = logging.getLogger("smyst.api.admin_language")

router = APIRouter(prefix="/admin/language", tags=["admin-language"])

#: Ziel-Backend der Tests: Produktion, per Env uebersteuerbar (Staging).
RUN_BASE_URL = os.environ.get("LANGUAGE_AUTOPILOT_BASE_URL", DEFAULT_BASE_URL).rstrip("/")

#: Obergrenze fuer manuelle "Jetzt testen"-Laeufe (Lastkontrolle).
MANUAL_RUN_LIMIT = 8

_ERROR_LIMIT = 25


class ToggleRequest(BaseModel):
    enabled: bool


class RunRequest(BaseModel):
    profile: str | None = Field(default=None, max_length=160)
    language: str | None = Field(default=None, max_length=16)
    function: str | None = Field(default=None, max_length=16)
    limit: int = Field(default=4, ge=1, le=MANUAL_RUN_LIMIT)


def _coverage(matrix: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    languages_seen: set[str] = set()
    profiles_seen: set[str] = set()
    for entry in matrix:
        result = str(entry.get("result") or "unknown")
        counts[result] = counts.get(result, 0) + 1
        if entry.get("language"):
            languages_seen.add(str(entry["language"]))
        if entry.get("profile"):
            profiles_seen.add(str(entry["profile"]))
    register = register_summary()
    registered = int(register["registered"])  # type: ignore[arg-type]
    tested_ok = len({
        str(e["language"]) for e in matrix if e.get("result") == "ok" and e.get("language")
    })
    return {
        "matrixEntries": len(matrix),
        "resultCounts": counts,
        "languagesTested": len(languages_seen),
        "languagesTestedOk": tested_ok,
        "profilesSeen": len(profiles_seen),
        "registeredLanguages": registered,
        "languagesUntested": max(registered - len(languages_seen), 0),
        "denominator": (
            f"{len(matrix)} gepruefte Matrix-Eintraege; {registered} Sprachen registriert, "
            f"davon {tested_ok} Sprachen mind. einmal bestanden, "
            f"{max(registered - len(languages_seen), 0)} noch ungeprueft. "
            "Vollabdeckung laeuft ueber Pruefzyklen (P0 zuerst)."
        ),
    }


def _errors(matrix: list[dict[str, Any]]) -> list[dict[str, Any]]:
    failures = [entry for entry in matrix if entry.get("result") in {"failed", "blocked"}]
    failures.sort(key=lambda entry: str(entry.get("testedAt") or ""), reverse=True)
    return [
        {
            "profile": entry.get("profile"),
            "language": entry.get("language"),
            "function": entry.get("function"),
            "result": entry.get("result"),
            "error": entry.get("error"),
            "findings": entry.get("findings"),
            "repro": entry.get("repro"),
            "testedAt": entry.get("testedAt"),
        }
        for entry in failures[:_ERROR_LIMIT]
    ]


@router.get("/autopilot")
async def language_autopilot_status(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    status = await asyncio.to_thread(store.load_status)
    matrix = await asyncio.to_thread(store.load_matrix, limit=2000)
    latency_hint: dict[str, Any] = {}
    if matrix:
        latencies = [int(entry.get("latencyMs") or 0) for entry in matrix if entry.get("latencyMs")]
        if latencies:
            latency_hint = {
                "latencyMsAvg": sum(latencies) // len(latencies),
                "latencyMsMax": max(latencies),
            }
    return {
        "ok": True,
        "enabled": bool(status.get("enabled")),
        "heartbeat": status.get("lastHeartbeat"),
        "lastRunAt": status.get("lastRunAt"),
        "runsCount": status.get("runsCount"),
        "lastRunSummary": status.get("lastRunSummary"),
        "register": register_summary(),
        "coverage": _coverage(matrix),
        "errors": _errors(matrix),
        "runtimes": latency_hint,
        "baseUrl": RUN_BASE_URL,
    }


@router.post("/autopilot/toggle")
async def language_autopilot_toggle(body: ToggleRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    session = _session_from_request(request) or {}
    status = await asyncio.to_thread(store.set_enabled, body.enabled)
    # Audit-Trail im Status-Dokument: Rolle + Zeitstempel (keine Klartext-
    # Personalien zusaetzlich zum signierten Session-Token).
    status["lastToggleBy"] = {
        "role": next((str(r) for r in (session.get("roles") or []) if r), "admin"),
        "at": datetime.now(UTC).isoformat(),
    }
    await asyncio.to_thread(store.save_status, status)
    return {"ok": True, "enabled": status.get("enabled"), "changedAt": status.get("changedAt")}


_RUN_LOCK = asyncio.Lock()


@router.post("/autopilot/run")
async def language_autopilot_run(body: RunRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if _RUN_LOCK.locked():
        return JSONResponse(
            status_code=409,
            content={"ok": False, "message": "Es laeuft bereits ein Testlauf."},
        )
    limit = min(body.limit, MANUAL_RUN_LIMIT)
    enabled_before = (await asyncio.to_thread(store.load_status)).get("enabled")

    async def _runner() -> None:
        async with _RUN_LOCK:
            # Urspruenglichen Ein-/Aus-Zustand sichern und danach
            # wiederherstellen (Auftrag Abschnitt 7): Einmaltest schaltet
            # den Dauerbetrieb nie ab.
            if not enabled_before:
                await asyncio.to_thread(store.set_enabled, True)
            try:
                await asyncio.to_thread(
                    execute_run,
                    RUN_BASE_URL,
                    limit=limit,
                    only_profile=body.profile,
                    only_language=body.language,
                    only_function=body.function,
                )
            finally:
                if not enabled_before:
                    await asyncio.to_thread(store.set_enabled, False)

    asyncio.get_running_loop().create_task(_runner())
    return {
        "ok": True,
        "started": True,
        "limit": limit,
        "filter": {
            "profile": body.profile,
            "language": body.language,
            "function": body.function,
        },
        "note": "Lauf gestartet; Ergebnis in der Matrix/Abdeckung in wenigen Minuten sichtbar.",
    }
