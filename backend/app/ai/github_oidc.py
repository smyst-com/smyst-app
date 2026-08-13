"""GitHub-OIDC fuer das CI-LLM-Gateway.

Warum OIDC statt eines geteilten Schluessels: die Pipeline laeuft in GitHub
Actions, der Chat-Server auf Zeabur. Ein gemeinsames Geheimnis muesste der
Betreiber an BEIDEN Stellen von Hand eintragen — genau der manuelle Schritt,
der hier vermieden werden soll. GitHub stellt jedem Job auf Anfrage ein kurz
gueltiges, signiertes Identitaetstoken aus; der Server prueft die Signatur
gegen GitHubs oeffentliche Schluessel und die Repository-Angabe im Token.

Client-Seite (Runner): ``fetch_actions_id_token``.
Server-Seite (Zeabur): ``GithubOidcVerifier``.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from time import time

import httpx

logger = logging.getLogger("smyst.ai.github_oidc")

ISSUER = "https://token.actions.githubusercontent.com"
JWKS_URL = f"{ISSUER}/.well-known/jwks"

#: Actions-Tokens laufen nach wenigen Minuten ab. Wir holen rechtzeitig ein
#: neues, damit ein langer QA-Schritt nicht mitten im Lauf 401 bekommt.
TOKEN_REFRESH_MARGIN_SECONDS = 120


class OidcUnavailableError(RuntimeError):
    """Kein Actions-OIDC verfuegbar (lokal, oder id-token-Permission fehlt)."""


def _decode_unverified_claims(token: str) -> dict[str, object]:
    """Liest die Claims OHNE Signaturpruefung — nur fuer die Ablaufzeit.

    Sicherheitsrelevante Entscheidungen trifft ausschliesslich der Server in
    ``GithubOidcVerifier``; hier geht es allein darum, wann wir ein frisches
    Token holen.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("kein JWT")
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))


@dataclass
class _CachedToken:
    value: str
    expires_at: float


class ActionsIdTokenSource:
    """Holt und cacht das OIDC-Token des laufenden Actions-Jobs."""

    def __init__(self, audience: str) -> None:
        self.audience = audience
        self._cached: _CachedToken | None = None

    @staticmethod
    def available() -> bool:
        return bool(
            os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
            and os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
        )

    async def token(self) -> str:
        cached = self._cached
        if cached and cached.expires_at - TOKEN_REFRESH_MARGIN_SECONDS > time():
            return cached.value
        value = await fetch_actions_id_token(self.audience)
        try:
            expires_at = float(_decode_unverified_claims(value).get("exp") or 0)
        except Exception:  # pragma: no cover - defekte Tokens faengt der Server ab
            expires_at = 0.0
        self._cached = _CachedToken(value=value, expires_at=expires_at)
        return value


async def fetch_actions_id_token(audience: str) -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not request_url or not request_token:
        raise OidcUnavailableError(
            "ACTIONS_ID_TOKEN_REQUEST_URL/-TOKEN fehlen "
            "(Workflow braucht permissions: id-token: write)"
        )
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            request_url,
            params={"audience": audience},
            headers={"Authorization": f"Bearer {request_token}"},
        )
        response.raise_for_status()
        value = response.json().get("value")
    if not isinstance(value, str) or not value:
        raise OidcUnavailableError("Actions-OIDC-Endpoint lieferte kein Token")
    return value


class GithubOidcVerifier:
    """Prueft ein Actions-OIDC-Token gegen GitHubs oeffentliche Schluessel."""

    def __init__(self, *, audience: str, repository: str) -> None:
        self.audience = audience
        self.repository = repository
        self._jwk_client: object | None = None

    def _client(self) -> object:
        if self._jwk_client is None:
            from jwt import PyJWKClient

            # PyJWKClient cacht die Schluessel selbst; GitHub rotiert selten.
            self._jwk_client = PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600)
        return self._jwk_client

    def verify(self, token: str) -> dict[str, object]:
        """Gibt die geprueften Claims zurueck oder wirft jwt.InvalidTokenError."""
        import jwt

        signing_key = self._client().get_signing_key_from_jwt(token)  # type: ignore[attr-defined]
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=self.audience,
            issuer=ISSUER,
            options={"require": ["exp", "iat", "aud", "iss"]},
        )
        repository = claims.get("repository")
        if repository != self.repository:
            raise jwt.InvalidTokenError(
                f"repository {repository!r} ist nicht freigegeben"
            )
        return claims
