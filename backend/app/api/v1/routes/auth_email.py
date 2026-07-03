"""E-Mail/Passwort-Login für smyst.com (/auth/email/*).

Konten liegen als private JSON-Objekte in IDrive e2 (Object Brain), Passwörter
als scrypt-Hash. Erfolgreiche Anmeldung/Registrierung liefert die Session sowohl
als HttpOnly-Cookie als auch als signiertes Bearer-Token im Response-Body —
gleiche Token-Mechanik wie der Google-Login (Cross-Site-Cookie-Fallback).

Antwortformat (Vertrag mit dem Frontend):
  Erfolg:  200 {"ok": true, "status": "active", "token": "v1...."}
  Fehler:  4xx/5xx {"ok": false, "error": {"code": "...", "message": "..."}}
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.auth import (
    SESSION_TTL_SECONDS,
    _cookie_kwargs,
    _make_token,
    _permissions_for_roles,
    _roles_for_email,
)
from app.integrations.email_account_store import (
    EmailAccountAlreadyExists,
    EmailAccountStoreNotConfigured,
    get_email_account_store,
    normalize_email,
)
from app.security.passwords import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    hash_password,
    spend_verification_time,
    verify_password,
)

router = APIRouter(prefix="/auth/email", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class ForgotRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"ok": False, "error": {"code": code, "message": message}})


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return _error(403, "csrf_required", "Ungültige Anfrage.")
    return None


def _session_response(account: dict[str, Any]) -> JSONResponse:
    email = account["email"]
    roles = _roles_for_email(email)
    now_ms = int(time.time() * 1000)
    session = {
        "sub": account["sub"],
        "email": email,
        "name": account.get("name") or email,
        "picture": None,
        "locale": None,
        "roles": roles,
        "permissions": _permissions_for_roles(roles),
        "createdAt": now_ms,
        "expiresAt": now_ms + SESSION_TTL_SECONDS * 1000,
    }
    token = _make_token(session)
    response = JSONResponse({"ok": True, "status": account.get("status", "active"), "token": token})
    response.set_cookie(value=token, **_cookie_kwargs())
    return response


@router.post("/register")
async def register(body: RegisterRequest, request: Request) -> JSONResponse:
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    email = normalize_email(body.email)
    if not EMAIL_PATTERN.match(email):
        return _error(400, "invalid_email", "Bitte gib eine gültige E-Mail-Adresse an.")
    if len(body.password) < PASSWORD_MIN_LENGTH:
        return _error(400, "weak_password", "Das Passwort muss mindestens 8 Zeichen lang sein.")

    store = get_email_account_store()
    password_hash = hash_password(body.password)
    try:
        account = await asyncio.to_thread(store.create_account, email, password_hash, body.name)
    except EmailAccountAlreadyExists:
        return _error(409, "email_taken", "Für diese E-Mail gibt es bereits ein Konto. Bitte logge dich ein.")
    except EmailAccountStoreNotConfigured:
        return _error(503, "email_service_unavailable", "E-Mail-Login ist hier nicht verfügbar.")
    except Exception:
        return _error(502, "storage_error", "Speicherdienst nicht erreichbar. Bitte später erneut versuchen.")
    return _session_response(account)


@router.post("/login")
async def login(body: LoginRequest, request: Request) -> JSONResponse:
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    email = normalize_email(body.email)
    if not EMAIL_PATTERN.match(email):
        return _error(401, "invalid_credentials", "E-Mail oder Passwort ist falsch.")

    store = get_email_account_store()
    try:
        account = await asyncio.to_thread(store.get_account, email)
    except EmailAccountStoreNotConfigured:
        return _error(503, "email_service_unavailable", "E-Mail-Login ist hier nicht verfügbar.")
    except Exception:
        return _error(502, "storage_error", "Speicherdienst nicht erreichbar. Bitte später erneut versuchen.")

    if account is None:
        # Gleiche Rechenzeit wie eine echte Prüfung → keine User-Enumeration über Timing.
        await asyncio.to_thread(spend_verification_time)
        return _error(401, "invalid_credentials", "E-Mail oder Passwort ist falsch.")
    if account.get("status") != "active":
        return _error(403, "account_disabled", "Dieses Konto ist deaktiviert.")
    valid = await asyncio.to_thread(verify_password, body.password, account.get("passwordHash") or {})
    if not valid:
        return _error(401, "invalid_credentials", "E-Mail oder Passwort ist falsch.")
    return _session_response(account)


@router.post("/forgot")
async def forgot(body: ForgotRequest, request: Request) -> JSONResponse:
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    # Bewusste Entscheidung: Es ist noch kein E-Mail-Versanddienst angebunden.
    # Ein ehrlicher Fehler ist besser als ein vorgetäuschter Reset-Link.
    return _error(
        503,
        "reset_service_unavailable",
        "Passwort-Zurücksetzen ist noch nicht verfügbar. Bitte melde dich über hello@smyst.com.",
    )
