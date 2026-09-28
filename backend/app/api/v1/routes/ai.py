from __future__ import annotations

from typing import Any

import logging
from functools import lru_cache

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.ai.dataflow import AiDataflowProbe
from app.ai.github_oidc import GithubOidcVerifier
from app.ai.llm_router import ping_providers, provider_statuses
from app.core.config import get_settings

logger = logging.getLogger("smyst.api.ai")

router = APIRouter(prefix="/ai", tags=["ai"])


@lru_cache(maxsize=4)
def _oidc_verifier(audience: str, repository: str) -> GithubOidcVerifier:
    return GithubOidcVerifier(audience=audience, repository=repository)


def _is_privileged(request: Request) -> bool:
    """Admin-Session ODER gueltiger GitHub-OIDC-Token (Smoke-Workflows).

    Der Provider-Ping loest ausgehende Requests an alle LLM-Provider aus
    (Kosten-/DoS-Vektor) und die Statusliste nennt Env-Namen, Base-URLs und
    Modelle - beides ist seit 28.09.2026 privilegierten Aufrufern vorbehalten.
    """
    from app.api.v1.routes.auth import _session_from_request

    session = _session_from_request(request)
    if session:
        permissions = session.get("permissions") or []
        roles = {str(role).lower() for role in (session.get("roles") or [])}
        if "admin:read" in permissions or ({"admin", "owner"} & roles):
            return True
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        settings = get_settings()
        token = header.split(" ", 1)[1].strip()
        try:
            _oidc_verifier(settings.ci_gateway_audience, settings.ci_gateway_repository).verify(token)
            return True
        except Exception:
            return False
    return False


def _require_admin(request: Request) -> JSONResponse | None:
    from app.api.v1.routes.auth import _session_from_request

    session = _session_from_request(request)
    if not session:
        return JSONResponse(
            status_code=401,
            content={"ok": False, "code": "auth_required", "message": "Bitte melde dich an."},
        )
    permissions = session.get("permissions") or []
    roles = {str(role).lower() for role in (session.get("roles") or [])}
    if "admin:read" not in permissions and not ({"admin", "owner"} & roles):
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "forbidden", "message": "Nur fuer Admins."},
        )
    return None


@router.get("/dataflow")
async def ai_dataflow(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    return await AiDataflowProbe().run()


@router.get("/providers")
async def ai_providers(request: Request, ping: bool = False) -> Any:
    privileged = _is_privileged(request)
    if ping and not privileged:
        return JSONResponse(
            status_code=403,
            content={
                "ok": False,
                "code": "forbidden",
                "message": "Provider-Ping nur mit Admin-Session oder CI-OIDC-Token.",
            },
        )
    statuses = provider_statuses()
    configured_count = sum(1 for status in statuses if status["configured"])
    if ping:
        ping_results = await ping_providers()
        for status in statuses:
            result = ping_results.get(str(status["provider"]))
            if result is not None:
                status["ping"] = result
    if not privileged:
        # Oeffentliche Sicht: nur Provider-Name und konfiguriert-Flag. Env-
        # Variablennamen (key_name), Base-URLs und Modellnamen sind interne
        # Konfiguration (Security-Fix 28.09.2026).
        statuses = [
            {
                "provider": status.get("provider"),
                "configured": status.get("configured"),
                "supported": status.get("supported"),
            }
            for status in statuses
        ]
    return {
        "legacy_edge": False,
        "runtime": "salad",
        "configured_count": configured_count,
        "ping_executed": ping,
        "providers": statuses,
    }
