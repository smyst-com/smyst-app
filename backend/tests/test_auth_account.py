"""Tests für /auth/account/* (DSGVO-Export und -Löschung)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi.testclient import TestClient

from app.api.v1.routes.auth import _make_token
from app.integrations import email_account_store as store_module
from app.integrations.email_account_store import EmailAccountAlreadyExists, normalize_email
from app.main import app

client = TestClient(app)

CSRF = {"X-Smyst-CSRF": "1"}
DELETE_HEADERS = {"X-Smyst-CSRF": "1", "X-Smyst-Delete-Confirm": "delete-account"}


class FakeStore:
    def __init__(self) -> None:
        self.accounts: dict[str, dict[str, Any]] = {}

    def is_configured(self) -> bool:
        return True

    def get_account(self, email: str) -> dict[str, Any] | None:
        return self.accounts.get(normalize_email(email))

    def create_account(self, email: str, password_hash: dict[str, Any], name: str | None) -> dict[str, Any]:
        normalized = normalize_email(email)
        if normalized in self.accounts:
            raise EmailAccountAlreadyExists(normalized)
        record = {
            "version": 1,
            "sub": f"email:{uuid.uuid4()}",
            "email": normalized,
            "name": (name or "").strip() or None,
            "passwordHash": password_hash,
            "status": "active",
            "emailVerified": False,
            "createdAt": int(time.time() * 1000),
            "updatedAt": int(time.time() * 1000),
        }
        self.accounts[normalized] = record
        return record

    def update_account(self, record: dict[str, Any]) -> dict[str, Any]:
        self.accounts[normalize_email(record["email"])] = dict(record)
        return dict(record)

    def delete_account(self, email: str) -> bool:
        return self.accounts.pop(normalize_email(email), None) is not None


def setup_function() -> None:
    store_module.set_email_account_store(FakeStore())  # type: ignore[arg-type]


def teardown_function() -> None:
    store_module.set_email_account_store(None)


def _register(email: str = "dsgvo@example.com") -> str:
    response = client.post(
        "/auth/email/register",
        json={"email": email, "password": "sicheres-passwort", "name": "DSGVO Test"},
        headers=CSRF,
    )
    assert response.status_code == 200
    return response.json()["token"]


def _google_session_token() -> str:
    now_ms = int(time.time() * 1000)
    return _make_token(
        {
            "sub": "google:123",
            "email": "smyst247@gmail.com",
            "name": "smyst",
            "roles": ["owner"],
            "permissions": [],
            "createdAt": now_ms,
            "expiresAt": now_ms + 60_000,
        }
    )


def test_export_requires_auth() -> None:
    assert client.get("/auth/account/export").status_code == 401


def test_export_contains_account_without_password_hash() -> None:
    token = _register()
    response = client.get("/auth/account/export", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["session"]["email"] == "dsgvo@example.com"
    assert body["account"] is not None
    assert "passwordHash" not in body["account"]
    assert "attachment" in response.headers["Content-Disposition"]


def test_delete_requires_confirmation_header() -> None:
    token = _register()
    response = client.post("/auth/account/delete", headers={**CSRF, "Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "delete_confirmation_required"


def test_delete_removes_email_account_and_blocks_login() -> None:
    token = _register()
    response = client.post(
        "/auth/account/delete", headers={**DELETE_HEADERS, "Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["deleted"]["accountRecord"] is True

    login = client.post(
        "/auth/email/login",
        json={"email": "dsgvo@example.com", "password": "sicheres-passwort"},
        headers=CSRF,
    )
    assert login.status_code == 401


def test_delete_for_google_session_is_stateless() -> None:
    token = _google_session_token()
    response = client.post(
        "/auth/account/delete", headers={**DELETE_HEADERS, "Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["deleted"]["accountRecord"] is False
    assert response.json()["deleted"]["session"] is True
