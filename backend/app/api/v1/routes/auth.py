from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
SESSION_COOKIE = "smyst_session"
STATE_TTL_SECONDS = 10 * 60
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(payload: str) -> str:
    secret = settings.effective_auth_session_secret or settings.auth_session_secret
    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def _make_token(payload: dict[str, Any]) -> str:
    body = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"v1.{body}.{_sign(body)}"


def _read_token(token: str) -> dict[str, Any] | None:
    try:
        version, body, signature = token.split(".", 2)
        if version != "v1" or not hmac.compare_digest(_sign(body), signature):
            return None
        payload = json.loads(_b64url_decode(body))
        if not isinstance(payload, dict) or int(payload.get("expiresAt", 0)) <= int(time.time() * 1000):
            return None
        return payload
    except Exception:
        return None


def _safe_return_to(raw: str | None) -> str:
    if not raw:
        return "/"
    if raw.startswith("/") and not raw.startswith("//"):
        return raw
    try:
        candidate = urlparse(raw)
        app = urlparse(settings.public_base_url)
        if candidate.scheme == app.scheme and candidate.netloc == app.netloc:
            path = candidate.path or "/"
            return f"{path}?{candidate.query}" if candidate.query else path
    except Exception:
        return "/"
    return "/"


def _roles_for_email(email: str) -> list[str]:
    normalized = email.lower()
    if normalized in settings.smyst_owner_emails:
        return ["owner"]
    if normalized in settings.smyst_admin_emails:
        return ["admin"]
    return ["member"]


def _permissions_for_roles(roles: list[str]) -> list[str]:
    base = [
        "auth:read",
        "profile:read",
        "profile:write",
        "storage:read",
        "storage:write",
        "storage:delete",
        "twin:read",
        "twin:write",
        "chat:read",
        "chat:write",
    ]
    if "admin" in roles or "owner" in roles:
        base.append("admin:read")
    if "owner" in roles:
        base.append("admin:write")
    return base


def _cookie_kwargs(max_age: int = SESSION_TTL_SECONDS) -> dict[str, Any]:
    # Frontend (smyst.com) und Auth-Backend (salad.cloud) sind cross-site.
    # SameSite=Lax wuerde das Cookie bei fetch()-Aufrufen von smyst.com nie mitsenden;
    # daher SameSite=None (nur bei HTTPS erlaubt). Safari blockt Third-Party-Cookies
    # trotzdem — deshalb traegt der Callback die Session zusaetzlich als Token im
    # URL-Fragment zurueck (siehe google_callback) und /me akzeptiert Bearer-Tokens.
    secure = settings.auth_public_base_url.startswith("https://")
    return {
        "key": SESSION_COOKIE,
        "max_age": max_age,
        "httponly": True,
        "secure": secure,
        "samesite": "none" if secure else "lax",
        "path": "/",
    }


def _require_session_secret() -> None:
    # Effektives Secret: AUTH_SESSION_SECRET oder deterministisch abgeleiteter
    # Subkey (siehe Settings.effective_auth_session_secret). Nur wenn beides
    # fehlt, ist kein sicheres Signieren moeglich.
    if not settings.effective_auth_session_secret:
        raise HTTPException(status_code=503, detail="Auth session secret is not configured.")


def _require_google_config() -> None:
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured.")
    _require_session_secret()


def _require_google_token_config() -> None:
    # Der Token-Login braucht kein Client-Secret: Das Token wird serverseitig
    # gegen Googles tokeninfo-Endpoint geprueft (aud muss unsere Client-ID sein).
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured.")
    _require_session_secret()


@router.get("/google/start")
async def google_start(return_to: str | None = None) -> RedirectResponse:
    _require_google_config()
    issued_at = int(time.time())
    nonce = secrets.token_urlsafe(24)
    state_payload = {
        "n": nonce,
        "iat": issued_at,
        # _read_token verlangt ein gueltiges expiresAt — ohne dieses Feld schlug
        # JEDER Callback mit "Invalid Google OAuth state." fehl (Bugfix 2026-07-03).
        "expiresAt": (issued_at + STATE_TTL_SECONDS) * 1000,
        "returnTo": _safe_return_to(return_to),
    }
    state = _make_token(state_payload)
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "include_granted_scopes": "true",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{httpx.QueryParams(params)}", status_code=status.HTTP_302_FOUND)


@router.get("/google/callback")
async def google_callback(code: str | None = None, state: str | None = None, error: str | None = None) -> Response:
    _require_google_config()
    if error:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing Google OAuth code or state.")

    state_payload = _read_token(state)
    if not state_payload:
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state.")
    if int(time.time()) - int(state_payload.get("iat", 0)) > STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="Expired Google OAuth state.")

    async with httpx.AsyncClient(timeout=10) as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.google_redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Google token exchange failed.")
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="Google access token missing.")

        user_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        if user_response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Google userinfo fetch failed.")
        google_user = user_response.json()

    email = str(google_user.get("email") or "").strip().lower()
    if not email or not google_user.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Verified Google email is required.")

    roles = _roles_for_email(email)
    now_ms = int(time.time() * 1000)
    session = {
        "sub": f"google:{google_user.get('sub')}",
        "email": email,
        "name": google_user.get("name") or email,
        "picture": google_user.get("picture"),
        "locale": google_user.get("locale"),
        "roles": roles,
        "permissions": _permissions_for_roles(roles),
        "createdAt": now_ms,
        "expiresAt": now_ms + SESSION_TTL_SECONDS * 1000,
    }
    token = _make_token(session)
    return_path = _safe_return_to(str(state_payload.get("returnTo") or "/"))
    # Session-Token im URL-Fragment: Fragmente werden nie an Server/Logs uebertragen.
    # Das Frontend liest das Token einmalig aus, speichert es und entfernt das Fragment
    # sofort aus der URL. Noetig, weil Cross-Site-Cookies (salad.cloud -> smyst.com)
    # von Safari immer und von anderen Browsern zunehmend blockiert werden.
    location = f"{settings.public_base_url.rstrip('/')}{return_path}#smyst_auth={token}"
    response = RedirectResponse(location, status_code=status.HTTP_302_FOUND)
    response.set_cookie(value=token, **_cookie_kwargs())
    return response


def _session_payload_for_google_user(google_user: dict[str, Any]) -> dict[str, Any]:
    email = str(google_user.get("email") or "").strip().lower()
    roles = _roles_for_email(email)
    now_ms = int(time.time() * 1000)
    return {
        "sub": f"google:{google_user.get('sub')}",
        "email": email,
        "name": google_user.get("name") or email,
        "picture": google_user.get("picture"),
        "locale": google_user.get("locale"),
        "roles": roles,
        "permissions": _permissions_for_roles(roles),
        "createdAt": now_ms,
        "expiresAt": now_ms + SESSION_TTL_SECONDS * 1000,
    }


@router.post("/google/token")
async def google_token_login(payload: dict[str, Any]) -> JSONResponse:
    """Login mit einem Google-ID-Token (Google Identity Services).

    Das Frontend holt das ID-Token client-seitig ueber GIS und schickt es
    hierher. Verifikation laeuft ueber Googles tokeninfo-Endpoint (Signatur,
    Ablauf) plus eigene aud/iss/email_verified-Checks. Es wird KEIN
    Client-Secret benoetigt — der Flow funktioniert daher auch, wenn nur
    GOOGLE_OAUTH_CLIENT_ID konfiguriert ist.
    """
    _require_google_token_config()
    credential = str(payload.get("credential") or "").strip()
    access_token = str(payload.get("access_token") or "").strip()
    if not credential and not access_token:
        raise HTTPException(status_code=400, detail="Missing Google credential or access token.")

    async with httpx.AsyncClient(timeout=10) as client:
        if credential:
            info_response = await client.get(
                GOOGLE_TOKENINFO_URL,
                params={"id_token": credential},
                headers={"Accept": "application/json"},
            )
            if info_response.status_code >= 400:
                raise HTTPException(status_code=401, detail="Google ID token is invalid or expired.")
            claims = info_response.json()
            if str(claims.get("iss") or "") not in GOOGLE_ISSUERS:
                raise HTTPException(status_code=401, detail="Google ID token issuer mismatch.")
            google_user = claims
        else:
            # Access-Token-Variante (GIS-Popup): tokeninfo prueft Gueltigkeit und
            # liefert aud — MUSS unsere Client-ID sein, sonst koennte ein fremdes
            # Google-Token zum Login missbraucht werden.
            info_response = await client.get(
                GOOGLE_TOKENINFO_URL,
                params={"access_token": access_token},
                headers={"Accept": "application/json"},
            )
            if info_response.status_code >= 400:
                raise HTTPException(status_code=401, detail="Google access token is invalid or expired.")
            claims = info_response.json()
            user_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            if user_response.status_code >= 400:
                raise HTTPException(status_code=502, detail="Google userinfo fetch failed.")
            google_user = user_response.json()
            google_user.setdefault("email", claims.get("email"))
            google_user.setdefault("email_verified", claims.get("email_verified"))

    audience = str(claims.get("aud") or claims.get("azp") or "")
    if audience != str(settings.google_oauth_client_id):
        raise HTTPException(status_code=401, detail="Google token audience mismatch.")
    email = str(google_user.get("email") or "").strip().lower()
    email_verified = str(google_user.get("email_verified") or "").lower() in {"true", "1"}
    if not email or not email_verified:
        raise HTTPException(status_code=401, detail="Verified Google email is required.")

    session = _session_payload_for_google_user(google_user)
    token = _make_token(session)
    response = JSONResponse(
        {
            "ok": True,
            "token": token,
            "user": {
                "sub": session["sub"],
                "email": session["email"],
                "name": session.get("name"),
                "picture": session.get("picture"),
                "locale": session.get("locale"),
                "roles": session.get("roles", ["member"]),
                "permissions": session.get("permissions", []),
            },
            "session": {"tokenType": "bearer", "expiresAt": session["expiresAt"]},
        }
    )
    response.set_cookie(value=token, **_cookie_kwargs())
    return response


def _session_from_request(request: Request) -> dict[str, Any] | None:
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        session = _read_token(authorization.removeprefix("Bearer ").strip())
        if session:
            return session
    return _read_token(request.cookies.get(SESSION_COOKIE, ""))


@router.get("/me")
async def me(request: Request) -> dict[str, Any]:
    session = _session_from_request(request)
    if not session:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user": {
            "sub": session["sub"],
            "email": session["email"],
            "name": session.get("name"),
            "picture": session.get("picture"),
            "locale": session.get("locale"),
            "roles": session.get("roles", ["member"]),
            "permissions": session.get("permissions", []),
        },
        "session": {
            "tokenType": "signed-httpOnly-cookie",
            "expiresAt": session["expiresAt"],
        },
    }


def _clear_session_cookie(response: JSONResponse) -> None:
    # Cross-Site-Cookie-Löschung: Browser akzeptieren das Set-Cookie einer
    # Cross-Site-Antwort nur mit denselben Attributen wie beim Setzen
    # (SameSite=None; Secure). Ein delete_cookie ohne diese Attribute wird
    # verworfen und die Session bliebe bestehen (Logout-Bugfix 2026-07-03).
    response.set_cookie(value="", **_cookie_kwargs(max_age=0))


@router.post("/logout")
async def logout() -> JSONResponse:
    response = JSONResponse({"ok": True})
    _clear_session_cookie(response)
    return response


@router.post("/logout-all")
async def logout_all() -> JSONResponse:
    response = JSONResponse({"ok": True, "mode": "stateless-current-session-cleared"})
    _clear_session_cookie(response)
    return response
