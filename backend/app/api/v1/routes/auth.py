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
SESSION_COOKIE = "smyst_session"
STATE_TTL_SECONDS = 10 * 60
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(payload: str) -> str:
    digest = hmac.new(settings.auth_session_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
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
    return {
        "key": SESSION_COOKIE,
        "max_age": max_age,
        "httponly": True,
        "secure": settings.auth_public_base_url.startswith("https://"),
        "samesite": "lax",
        "path": "/",
    }


def _require_google_config() -> None:
    secret_bytes = len(settings.auth_session_secret.encode("utf-8"))
    if secret_bytes < 32:
        raise HTTPException(status_code=500, detail="Auth session secret is too short.")
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured.")


@router.get("/google/start")
async def google_start(return_to: str | None = None) -> RedirectResponse:
    _require_google_config()
    issued_at = int(time.time())
    nonce = secrets.token_urlsafe(24)
    state_payload = {"n": nonce, "iat": issued_at, "returnTo": _safe_return_to(return_to)}
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
    location = f"{settings.public_base_url.rstrip('/')}{_safe_return_to(str(state_payload.get('returnTo') or '/'))}"
    response = RedirectResponse(location, status_code=status.HTTP_302_FOUND)
    response.set_cookie(value=token, **_cookie_kwargs())
    return response


@router.get("/me")
async def me(request: Request) -> dict[str, Any]:
    session = _read_token(request.cookies.get(SESSION_COOKIE, ""))
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


@router.post("/logout")
async def logout() -> JSONResponse:
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.post("/logout-all")
async def logout_all() -> JSONResponse:
    response = JSONResponse({"ok": True, "mode": "stateless-current-session-cleared"})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
