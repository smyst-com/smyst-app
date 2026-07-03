"""DSGVO-Endpunkte für smyst.com: Export und Löschung des eigenen Kontos.

Privacy by Design:
- Beide Endpunkte wirken ausschließlich auf das Konto der angemeldeten Session
  (Bearer-Token oder HttpOnly-Cookie) — kein Zugriff auf fremde Konten möglich.
- Der Export enthält niemals den Passwort-Hash.
- Die Löschung verlangt eine explizite Bestätigung per Header und entfernt den
  Konto-Datensatz vollständig aus dem privaten IDrive-e2-Bucket.
- Google-Sitzungen sind serverseitig zustandslos: Es existiert kein Datensatz,
  der gelöscht werden könnte; die Löschung beendet die Session.
- Audit-Ereignisse enthalten keine E-Mail-Adressen (nur den Sub-Typ).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from app.api.v1.routes.auth import _clear_session_cookie, _session_from_request
from app.integrations.email_account_store import (
    EmailAccountStore,
    EmailAccountStoreNotConfigured,
    get_email_account_store,
)
from app.security.audit import AuditEvent, audit_log_service

logger = logging.getLogger("smyst.auth.account")

router = APIRouter(prefix="/auth/account", tags=["auth"])

# Bestätigungs-Header für die Kontolöschung. Der Wert ist bewusst eindeutig und
# selbsterklärend; er verhindert versehentliche Löschungen, ist aber KEIN Geheimnis.
ERASE_CONFIRM_HEADER = "X-Smyst-Erase-Confirm"
ERASE_CONFIRM_VALUE = "KONTO-ENDGUELTIG-LOESCHEN"
DELETE_CONFIRM_HEADER = "X-Smyst-Delete-Confirm"
DELETE_CONFIRM_VALUE = "delete-account"  # interner Alias (Tests/lokal)


def _hard_delete_in_background(store: EmailAccountStore, email: str) -> None:
    """Best-effort Objekt-Delete nach gesendeter Antwort (blockiert nie den Request)."""
    try:
        store.hard_delete_account(email)
    except Exception:  # noqa: BLE001 - Hintergrund-Task darf nie hochblubbern
        logger.warning("hard delete of email account object failed (tombstone bleibt aktiv)")


def _has_erase_confirmation(request: Request) -> bool:
    return (
        request.headers.get(ERASE_CONFIRM_HEADER) == ERASE_CONFIRM_VALUE
        or request.headers.get(DELETE_CONFIRM_HEADER) == DELETE_CONFIRM_VALUE
    )


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"ok": False, "error": {"code": code, "message": message}})


def _sub_type(session: dict[str, Any]) -> str:
    return str(session.get("sub", "")).split(":", 1)[0] or "unknown"


@router.get("/export")
async def export_account(request: Request) -> JSONResponse:
    session = _session_from_request(request)
    if not session:
        return _error(401, "auth_required", "Bitte melde dich an, um deine Daten zu exportieren.")

    account: dict[str, Any] | None = None
    if _sub_type(session) == "email":
        store = get_email_account_store()
        try:
            record = await asyncio.to_thread(store.get_account, str(session["email"]))
        except Exception:
            record = None
        if record is not None:
            # Passwort-Hash gehört nicht in einen Nutzer-Export.
            account = {key: value for key, value in record.items() if key != "passwordHash"}

    payload = {
        "export": {
            "platform": "smyst.com",
            "type": "account",
            "createdAt": int(time.time() * 1000),
        },
        "session": {
            "sub": session.get("sub"),
            "email": session.get("email"),
            "name": session.get("name"),
            "roles": session.get("roles", []),
        },
        "account": account,
    }
    response = JSONResponse(payload)
    response.headers["Content-Disposition"] = 'attachment; filename="smyst.com-account-export.json"'
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/erase")
@router.post("/delete")
async def delete_account(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    # Zweistufige Löschung (2026-07-03 verifiziert): Ein synchroner S3-Objekt-Delete
    # im Request-Pfad reißt über das Salad-Gateway die Verbindung ab. Deshalb:
    #   1) synchron: Grabstein per put_object (PII sofort weg, Login sofort gesperrt),
    #   2) asynchron: endgültiger Objekt-Delete als BackgroundTask (best-effort).
    # /erase ist der Standardpfad; /delete bleibt als Alias erhalten.
    if request.headers.get("X-Smyst-CSRF") != "1":
        return _error(403, "csrf_required", "Ungültige Anfrage.")
    if not _has_erase_confirmation(request):
        return _error(
            403,
            "delete_confirmation_required",
            f'Löschung erfordert den Header {ERASE_CONFIRM_HEADER}: "{ERASE_CONFIRM_VALUE}".',
        )
    session = _session_from_request(request)
    if not session:
        return _error(401, "auth_required", "Bitte melde dich an, um dein Konto zu löschen.")

    tombstoned = False
    if _sub_type(session) == "email":
        store = get_email_account_store()
        email = str(session["email"])
        try:
            tombstoned = await asyncio.to_thread(store.tombstone_account, email)
        except EmailAccountStoreNotConfigured:
            return _error(503, "email_service_unavailable", "Kontolöschung ist hier nicht verfügbar.")
        except Exception:
            return _error(502, "storage_error", "Speicherdienst nicht erreichbar. Bitte später erneut versuchen.")
        if tombstoned:
            # Endgültigen Objekt-Delete NACH der Antwort ausführen.
            background_tasks.add_task(_hard_delete_in_background, store, email)

    # Datenschutz: Audit ohne E-Mail-Adresse, nur Sub-Typ.
    audit_log_service.record(
        AuditEvent(
            action="account.delete",
            resource_type="auth_account",
            metadata={"subType": _sub_type(session), "accountRecordDeleted": tombstoned},
        )
    )

    response = JSONResponse(
        {
            "ok": True,
            "deleted": {"accountRecord": tombstoned, "session": True},
            "note": (
                "Google-Sitzungen sind serverseitig zustandslos; es existiert kein "
                "Google-Kontodatensatz auf smyst.com-Servern."
            ),
        }
    )
    _clear_session_cookie(response)
    return response
