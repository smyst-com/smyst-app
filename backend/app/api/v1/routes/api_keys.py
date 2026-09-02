"""Nutzer-API-Keys fuer smyst 1.0 / smyst 1.1 (OpenRouter-Stil).

Jeder angemeldete Nutzer kann private API-Keys erstellen und damit die
eigenen smyst-Modelle per OpenAI-kompatibler API nutzen:

    POST /api/chat/completions
    Authorization: Bearer sk-smyst-v1-...

Sicherheit by Design:
- Vom Secret wird NUR ein SHA-256-Hash gespeichert; der Klartext wird
  genau einmal bei der Erstellung angezeigt (wie bei OpenRouter).
- Jeder Key ist fest an sein Konto gebunden (Lookup-Index im Object
  Brain: api-keys/<hash>.json -> Nutzerdokument). Ohne gueltigen Key
  gibt es keinen Zugriff auf fremde Daten.
- Keys koennen jederzeit geloescht werden; geloeschte Keys schlagen
  sofort fehl, der Eintrag mit Nutzungshistorie bleibt im Konto.
- Persistenz wie user_mvp: privates JSON im Object Brain (IDrive e2),
  RAM-Cache als Fallback ohne e2-Keys. Es wird nie hart geloescht;
  das Index-Dokument eines geloeschten Key-Eintrags entfaellt nur
  logisch (tombstone), damit nichts unwiderruflich verloren geht.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.auth import _session_from_request
from app.core.config import settings
from app.integrations import user_store

logger = logging.getLogger("smyst.api.api_keys")

router = APIRouter(tags=["api-keys"])

KEY_PREFIX = "sk-smyst-v1-"
KEY_INDEX_PREFIX = "api-keys/"
MAX_KEYS = 20
MAX_NAME_LEN = 80

# Vergebbare Modell-Auspraegungen. "auto" bedeutet: immer das aktuell
# trainierte smyst-Modell (derzeit smyst-1.1) — fuer Nutzer die
# idiotensichere Standardwahl.
MODEL_AUTO = "auto"
MODEL_IDS = {"smyst-1.0", "smyst-1.1", MODEL_AUTO}
DEFAULT_MODEL = MODEL_AUTO

# llama-server (start-llm.sh) braucht auf CPU bei laengeren Antworten
# mehrere Minuten; bewusst grosszuegig wie die Pipeline (240 s).
UPSTREAM_TIMEOUT = httpx.Timeout(connect=6.0, read=240.0, write=60.0, pool=6.0)

STORAGE_NOTE = "Privat im Object Brain (IDrive e2) gespeichert; ohne Speicher-Keys nur fluechtig im RAM."


def _now_ms() -> int:
    return int(time.time() * 1000)


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"ok": False, "error": {"code": code, "message": message}},
    )


def _openai_error(status_code: int, message: str, err_type: str, code: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"message": message, "type": err_type, "code": code}},
    )


def _clean_text(value: Any, max_len: int) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:max_len]


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _new_key_id() -> str:
    return f"key-{secrets.token_hex(6)}"


def _require_sub(request: Request) -> tuple[str | None, JSONResponse | None]:
    session = _session_from_request(request)
    if not session:
        return None, _error(401, "auth_required", "Bitte melde dich an, um API-Keys zu verwalten.")
    sub = str(session.get("sub", "")).strip()
    if not sub:
        return None, _error(401, "auth_required", "Session ohne Nutzerkennung.")
    return sub, None


def _load_doc(sub: str) -> dict[str, Any]:
    doc = user_store.load_user_doc(sub)
    if not isinstance(doc, dict):
        doc = {}
    doc.setdefault("userSub", sub)
    doc.setdefault("apiKeys", [])
    return doc


def _public_key(entry: dict[str, Any]) -> dict[str, Any]:
    """Maskierte Key-Sicht: nie den Hash, nie das Secret."""
    return {
        "id": entry.get("id"),
        "name": entry.get("name"),
        "model": entry.get("model", DEFAULT_MODEL),
        "preview": entry.get("preview"),
        "createdAt": entry.get("createdAt", 0),
        "lastUsedAt": entry.get("lastUsedAt", 0),
        "usageCount": entry.get("usageCount", 0),
        "revokedAt": entry.get("revokedAt", 0),
    }


# --- Lookup-Index (Object Brain): hash -> Konto --------------------------
# Ein kleines JSON pro Key. Der RAM-Cache haelt Lesezugriffe des Gateways
# schnell; ohne e2-Keys funktioniert alles fluechtig im RAM weiter.

_INDEX_MEMORY: dict[str, dict[str, Any]] = {}


def _index_key(digest: str) -> str:
    return f"{KEY_INDEX_PREFIX}{digest}.json"


def _load_index(digest: str) -> dict[str, Any] | None:
    cached = _INDEX_MEMORY.get(digest)
    if cached is not None:
        return cached or None
    if not user_store.storage_configured():
        return None
    try:
        response = user_store._client().get_object(
            Bucket=settings.idrive_e2_bucket, Key=_index_key(digest)
        )
        data = json.loads(response["Body"].read().decode("utf-8"))
        if isinstance(data, dict) and data.get("userSub"):
            _INDEX_MEMORY[digest] = data
            return data
        return None
    except Exception:
        return None


def _save_index(digest: str, doc: dict[str, Any] | None) -> None:
    """Schreibt oder entfernt (doc=None) den Index-Eintrag. Wirft nie."""
    if doc is None:
        _INDEX_MEMORY[digest] = {}
        if not user_store.storage_configured():
            return
        try:
            user_store._client().delete_object(
                Bucket=settings.idrive_e2_bucket, Key=_index_key(digest)
            )
        except Exception as exc:
            logger.warning("api-key index delete failed (%s)", type(exc).__name__)
        return
    _INDEX_MEMORY[digest] = doc
    if not user_store.storage_configured():
        return
    try:
        user_store._client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=_index_key(digest),
            Body=json.dumps(doc, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
    except Exception as exc:
        logger.warning("api-key index write failed (%s)", type(exc).__name__)


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_NAME_LEN)
    model: str | None = None


@router.get("/api-keys")
def list_api_keys(request: Request) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    keys = [_public_key(entry) for entry in doc["apiKeys"]]
    return {
        "keys": keys,
        "limits": {"maxKeys": MAX_KEYS},
        "models": [
            {"id": "smyst-1.1", "label": "smyst 1.1", "note": "Neuestes Modell (empfohlen)"},
            {"id": "smyst-1.0", "label": "smyst 1.0", "note": "Erste Generation"},
            {"id": "auto", "label": "Beide / neueste", "note": "Immer das aktuell trainierte Modell"},
        ],
        "server": _llm_status(),
        "storageNote": STORAGE_NOTE,
    }


@router.post("/api-keys")
def create_api_key(request: Request, payload: ApiKeyCreate) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    active = [entry for entry in doc["apiKeys"] if not entry.get("revokedAt")]
    if len(active) >= MAX_KEYS:
        return _error(409, "key_limit", f"Maximal {MAX_KEYS} aktive API-Keys pro Konto.")
    name = _clean_text(payload.name, MAX_NAME_LEN) or "Mein Key"
    model = payload.model if payload.model in MODEL_IDS else DEFAULT_MODEL
    secret = f"{KEY_PREFIX}{secrets.token_hex(18)}"
    digest = _hash_secret(secret)
    now = _now_ms()
    entry = {
        "id": _new_key_id(),
        "name": name,
        "model": model,
        "keyHash": digest,
        "preview": f"{secret[:19]}...{secret[-4:]}",
        "createdAt": now,
        "lastUsedAt": 0,
        "usageCount": 0,
        "revokedAt": 0,
    }
    doc["apiKeys"] = [e for e in doc["apiKeys"] if not e.get("revokedAt")] + [entry]
    user_store.save_user_doc(sub, doc)
    # Lookup-Index erst nach erfolgreichem Konto-Schreiben anlegen — ein
    # Key ohne Konto-Eintrag wuerde am Gateway nie authentifizieren.
    _save_index(digest, {"userSub": sub, "keyId": entry["id"], "createdAt": now})
    return {
        "key": _public_key(entry),
        # Das Secret existiert nur in DIESER Antwort und wird nie wieder
        # ausgeliefert (nur Hash gespeichert).
        "secret": secret,
        "warning": "Diesen Key nur jetzt anzeigen. Kopiere ihn jetzt — spaeter ist er nicht mehr sichtbar.",
    }


@router.delete("/api-keys/{key_id}")
def delete_api_key(request: Request, key_id: str) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    entry = next((e for e in doc["apiKeys"] if e.get("id") == key_id and not e.get("revokedAt")), None)
    if not entry:
        return _error(404, "key_not_found", "API-Key nicht gefunden.")
    now = _now_ms()
    entry["revokedAt"] = now
    user_store.save_user_doc(sub, doc)
    # Gateway-Zugriff sofort entziehen; der tombstonte Konto-Eintrag mit
    # Nutzungshistorie bleibt erhalten (nichts wird hart geloescht).
    _save_index(str(entry.get("keyHash")), None)
    return {"ok": True, "key": _public_key(entry)}


# --- OpenAI-kompatibles Gateway ------------------------------------------

def _canonical_model(model: Any) -> str:
    text = str(model or "").strip().lower()
    if "1.0" in text:
        return "smyst-1.0"
    if "1.1" in text:
        return "smyst-1.1"
    return DEFAULT_MODEL


def _llm_status() -> dict[str, Any]:
    base_url = (settings.smyst_llm_base_url or "").rstrip("/")
    if not base_url:
        return {"online": False, "modelId": ""}
    try:
        response = httpx.get(f"{base_url}/models", timeout=httpx.Timeout(connect=2.0, read=3.0))
        if response.status_code != 200:
            return {"online": False, "modelId": ""}
        data = response.json()
        models = data.get("data") if isinstance(data, dict) else []
        model_id = str((models[0] or {}).get("id", "")) if models else ""
        return {"online": True, "modelId": model_id}
    except Exception:
        return {"online": False, "modelId": ""}


def _authenticate_key(request: Request) -> tuple[dict[str, Any], dict[str, Any]] | JSONResponse:
    """Bearer-Key pruefen und (Key-Eintrag, Nutzerdokument) liefern."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return _openai_error(
            401,
            "Missing API key. Send it as 'Authorization: Bearer sk-smyst-v1-...'.",
            "authentication_error",
            "missing_api_key",
        )
    secret = authorization.removeprefix("Bearer ").strip()
    if not secret.startswith(KEY_PREFIX) or len(secret) > 120:
        return _openai_error(
            401,
            "Invalid API key format. smyst keys start with 'sk-smyst-v1-'.",
            "authentication_error",
            "invalid_api_key",
        )
    digest = _hash_secret(secret)
    index = _load_index(digest)
    if not index:
        return _openai_error(401, "Incorrect API key provided.", "authentication_error", "invalid_api_key")
    sub = str(index.get("userSub", ""))
    doc = user_store.load_user_doc(sub) if sub else None
    if not isinstance(doc, dict):
        return _openai_error(401, "Incorrect API key provided.", "authentication_error", "invalid_api_key")
    entry = next(
        (
            e
            for e in doc.get("apiKeys", [])
            if e.get("id") == index.get("keyId")
            and hmac.compare_digest(str(e.get("keyHash", "")), digest)
        ),
        None,
    )
    if not entry or entry.get("revokedAt"):
        return _openai_error(401, "This API key has been revoked.", "authentication_error", "key_revoked")
    return entry, doc


def _record_usage(doc: dict[str, Any], entry: dict[str, Any]) -> None:
    try:
        entry["usageCount"] = int(entry.get("usageCount", 0)) + 1
        entry["lastUsedAt"] = _now_ms()
        sub = str(doc.get("userSub", ""))
        if sub:
            user_store.save_user_doc(sub, doc)
    except Exception:
        logger.warning("api-key usage update failed", exc_info=True)


@router.post("/chat/completions")
async def chat_completions(request: Request) -> Any:
    """OpenAI-kompatibler Endpunkt fuer Nutzer-Keys (smyst 1.0 / 1.1)."""
    auth = _authenticate_key(request)
    if isinstance(auth, JSONResponse):
        return auth
    entry, doc = auth

    base_url = (settings.smyst_llm_base_url or "").rstrip("/")
    if not base_url:
        return _openai_error(
            503,
            "smyst models are not available right now. Please try again later.",
            "api_error",
            "model_unavailable",
        )

    try:
        payload = await request.json()
    except Exception:
        return _openai_error(400, "Request body must be valid JSON.", "invalid_request_error", "invalid_body")
    if not isinstance(payload, dict) or not payload.get("messages"):
        return _openai_error(
            400, "'messages' is required (OpenAI chat format).", "invalid_request_error", "missing_messages"
        )

    requested = payload.get("model") or entry.get("model") or DEFAULT_MODEL
    canonical = _canonical_model(requested)
    upstream_payload = {
        "model": canonical,
        "messages": payload.get("messages"),
        "stream": bool(payload.get("stream", False)),
    }
    for field in ("max_tokens", "temperature", "top_p", "stop", "presence_penalty", "frequency_penalty"):
        if payload.get(field) is not None:
            upstream_payload[field] = payload[field]

    _record_usage(doc, entry)
    headers = {"Content-Type": "application/json"}
    api_key = settings.smyst_llm_api_key
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        if upstream_payload["stream"]:
            return StreamingResponse(
                _stream_upstream(base_url, upstream_payload, headers),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client:
            response = await client.post(f"{base_url}/chat/completions", json=upstream_payload, headers=headers)
        if response.status_code >= 400:
            return _openai_error(
                502,
                "smyst model server error. Please try again later.",
                "api_error",
                "upstream_error",
            )
        data = response.json()
        if isinstance(data, dict):
            served = str(data.get("model") or canonical)
            data["model"] = canonical
            data["served_model"] = served
        return JSONResponse(data)
    except httpx.HTTPError:
        return _openai_error(
            503,
            "smyst model server is not reachable right now. Please try again later.",
            "api_error",
            "model_unreachable",
        )


async def _stream_upstream(base_url: str, payload: dict[str, Any], headers: dict[str, str]):
    """Reicht den SSE-Strom des llama-servers 1:1 an den Nutzer weiter."""
    try:
        async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{base_url}/chat/completions", json=payload, headers=headers
            ) as response:
                if response.status_code >= 400:
                    yield (
                        b'data: {"error": {"message": "smyst model server error.", '
                        b'"type": "api_error", "code": "upstream_error"}}\n\n'
                    )
                    yield "data: [DONE]\n\n"
                    return
                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk
    except httpx.HTTPError:
        yield (
            b'data: {"error": {"message": "smyst model server is not reachable right now.", '
            b'"type": "api_error", "code": "model_unreachable"}}\n\n'
        )
        yield "data: [DONE]\n\n"
