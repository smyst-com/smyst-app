"""Tests für /auth/email/* — nutzt einen In-Memory-Fake statt IDrive e2."""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi.testclient import TestClient

from app.integrations import email_account_store as store_module
from app.integrations.email_account_store import (
    EmailAccountAlreadyExists,
    normalize_email,
)
from app.main import app
from app.security.passwords import hash_password, verify_password

client = TestClient(app)

CSRF = {"X-Smyst-CSRF": "1"}


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
        now_ms = int(time.time() * 1000)
        record = {
            "version": 1,
            "sub": f"email:{uuid.uuid4()}",
            "email": normalized,
            "name": (name or "").strip() or None,
            "passwordHash": password_hash,
            "status": "active",
            "emailVerified": False,
            "createdAt": now_ms,
            "updatedAt": now_ms,
        }
        self.accounts[normalized] = record
        return record


def setup_function() -> None:
    store_module.set_email_account_store(FakeStore())  # type: ignore[arg-type]


def teardown_function() -> None:
    store_module.set_email_account_store(None)


def test_password_hash_roundtrip() -> None:
    record = hash_password("correct horse battery")
    assert verify_password("correct horse battery", record) is True
    assert verify_password("wrong password 123", record) is False


def test_register_creates_session() -> None:
    response = client.post(
        "/auth/email/register",
        json={"email": "Neu@Example.com", "password": "sicheres-passwort", "name": "Neu"},
        headers=CSRF,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["token"].startswith("v1.")

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json()["authenticated"] is True
    assert me.json()["user"]["email"] == "neu@example.com"


def test_register_rejects_duplicate_email() -> None:
    payload = {"email": "doppelt@example.com", "password": "sicheres-passwort"}
    assert client.post("/auth/email/register", json=payload, headers=CSRF).status_code == 200
    response = client.post("/auth/email/register", json=payload, headers=CSRF)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_register_rejects_weak_password_and_bad_email() -> None:
    weak = client.post(
        "/auth/email/register", json={"email": "a@example.com", "password": "kurz"}, headers=CSRF
    )
    assert weak.status_code == 400
    assert weak.json()["error"]["code"] == "weak_password"

    bad = client.post(
        "/auth/email/register", json={"email": "keine-email", "password": "sicheres-passwort"}, headers=CSRF
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "invalid_email"


def test_login_success_and_failure() -> None:
    client.post(
        "/auth/email/register",
        json={"email": "login@example.com", "password": "sicheres-passwort"},
        headers=CSRF,
    )

    ok = client.post(
        "/auth/email/login",
        json={"email": "LOGIN@example.com", "password": "sicheres-passwort"},
        headers=CSRF,
    )
    assert ok.status_code == 200
    assert ok.json()["token"].startswith("v1.")

    wrong = client.post(
        "/auth/email/login",
        json={"email": "login@example.com", "password": "falsches-passwort"},
        headers=CSRF,
    )
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "invalid_credentials"

    unknown = client.post(
        "/auth/email/login",
        json={"email": "unbekannt@example.com", "password": "egal-egal-egal"},
        headers=CSRF,
    )
    assert unknown.status_code == 401
    assert unknown.json()["error"]["code"] == "invalid_credentials"


def test_csrf_header_required() -> None:
    response = client.post(
        "/auth/email/login",
        json={"email": "login@example.com", "password": "sicheres-passwort"},
    )
    assert response.status_code == 403


def test_forgot_reports_unavailable() -> None:
    response = client.post("/auth/email/forgot", json={"email": "wer@example.com"}, headers=CSRF)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "reset_service_unavailable"
