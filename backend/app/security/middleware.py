from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.security.audit import AuditEvent, audit_log_service
from app.security.rate_limit import rate_limiter

#: Methoden ohne zustandsaendernde Wirkung - vom CSRF-Schutz ausgenommen.
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

#: Name des Session-Cookies (identisch zu app.api.v1.routes.auth.SESSION_COOKIE).
SESSION_COOKIE = "smyst_session"

#: Header, den das Frontend bei Cookie-authentifizierten Mutationen mitschickt
#: (etabliert in storage.py/auth_email.py, jetzt zentral erzwungen).
CSRF_HEADER = "x-smyst-csrf"

#: Striktere Fenster fuer teure oder missbrauchsanfaellige Pfade (Requests pro
#: IP und Minute). Pfade sind praefix-matchend auf dem normalisierten Pfad,
#: damit das Dreifach-Mount (/api/v1, /api, /) nicht drei Budgets liefert.
PATH_RATE_LIMITS: list[tuple[str, int]] = [
    ("/auth/email/login", 10),
    ("/auth/email/register", 10),
    ("/auth/email/forgot-password", 10),
    ("/auth/email/reset-password", 10),
    ("/tts", 30),
    ("/asr/transcribe", 12),
    ("/ads/impression", 60),
    ("/visits", 30),
    ("/web-research/run", 12),
    ("/web-research/public-profile-suggestions", 12),
    ("/security/csp-report", 60),
]


def normalize_request_path(path: str) -> str:
    """Entfernt die API-Mount-Präfixe, damit alle drei Mounts ein Budget teilen."""
    for prefix in ("/api/v1", "/api"):
        if path == prefix:
            return "/"
        if path.startswith(prefix + "/"):
            return path[len(prefix) :]
    return path


def _path_rate_limit(path: str) -> int | None:
    for prefix, limit in PATH_RATE_LIMITS:
        if path == prefix or path.startswith(prefix + "/"):
            return limit
    return None


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        csp_header = "Content-Security-Policy-Report-Only" if settings.csp_report_only else "Content-Security-Policy"
        response.headers.setdefault(csp_header, settings.content_security_policy)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=(self)")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        # Hinter dem Zeabur-Proxy ist request.url.scheme immer "http" - der
        # TLS-Verkehr des Clients sieht der Container nicht. In Produktion wird
        # HSTS daher immer gesetzt (live 28.09.2026: HSTS fehlte komplett).
        if settings.app_env == "production" or request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
        return response


class CookieCsrfMiddleware(BaseHTTPMiddleware):
    """Zentraler CSRF-Schutz fuer Cookie-Sessions.

    Das Session-Cookie ist SameSite=None (noetig, weil Frontend und Auth-
    Backend cross-site laufen). Betroffen sind deshalb nur Mutationen, die
    sich ueber das Cookie authentifizieren koennten:

    - Anfragen mit Authorization-Header (Bearer/OIDC) passieren: Cross-Site-
      Angreifer koennen keine eigenen Header setzen (CORS-Preflight).
    - Anfragen ohne Session-Cookie passieren (Gast-Chats): kein ambient
      Authority-Merkmal, das ein Angreifer mitreissen koennte.
    - Alles andere (Mutation + Cookie + kein Authorization) verlangt
      X-Smyst-CSRF: 1 - derselbe Header, den storage.py/auth_email.py und das
      Frontend (apiJson/JSON_POST_HEADERS) bereits verwenden.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if (
            request.method not in SAFE_METHODS
            and SESSION_COOKIE in request.cookies
            and "authorization" not in request.headers
            and request.headers.get(CSRF_HEADER) != "1"
        ):
            audit_log_service.record(
                AuditEvent(
                    action="csrf.blocked",
                    resource_type="request",
                    metadata={"path": request.url.path, "method": request.method},
                )
            )
            return JSONResponse(
                {"ok": False, "code": "csrf_required", "message": "Ungültige Anfrage."},
                status_code=status.HTTP_403_FORBIDDEN,
            )
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = normalize_request_path(request.url.path)
        if path.startswith("/health"):
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        key = f"{client}:{path}"
        limit = _path_rate_limit(path) or settings.rate_limit_requests
        decision = rate_limiter.check(
            key=key,
            limit=limit,
            window_seconds=settings.rate_limit_window_seconds,
        )
        if not decision.allowed:
            audit_log_service.record(
                AuditEvent(
                    action="rate_limit.block",
                    resource_type="request",
                    metadata={"path": path, "client": client, "limit": limit},
                )
            )
            return JSONResponse(
                {
                    "error": {
                        "code": "rate_limit.exceeded",
                        "message": "Too many requests.",
                    }
                },
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "Retry-After": str(decision.reset_seconds),
                    "X-RateLimit-Remaining": str(decision.remaining),
                    "X-RateLimit-Reset": str(decision.reset_seconds),
                },
            )

        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Remaining", str(decision.remaining))
        response.headers.setdefault("X-RateLimit-Reset", str(decision.reset_seconds))
        return response
