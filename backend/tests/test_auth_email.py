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

    def update_account(self, record: dict[str, Any]) -> dict[str, Any]:
        self.accounts[normalize_email(record["email"])] = dict(record)
        return dict(record)

    def delete_account(self, email: str) -> bool:
        return self.accounts.pop(normalize_email(email), None) is not None


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


def test_forgot_reports_unavailable_without_mail_provider() -> None:
    response = client.post("/auth/email/forgot", json={"email": "wer@example.com"}, headers=CSRF)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "reset_service_unavailable"


def test_password_reset_flow(monkeypatch) -> None:
    from app.api.v1.routes import auth_email as auth_email_module

    sent: list[dict[str, str]] = []

    async def fake_send_email(to: str, subject: str, text: str) -> None:
        sent.append({"to": to, "subject": subject, "text": text})

    monkeypatch.setattr(auth_email_module, "is_email_sending_configured", lambda: True)
    monkeypatch.setattr(auth_email_module, "send_email", fake_send_email)

    client.post(
        "/auth/email/register",
        json={"email": "reset@example.com", "password": "altes-passwort-123"},
        headers=CSRF,
    )

    # Forgot: gleiche Antwort für existierende und unbekannte Konten (Anti-Enumeration).
    known = client.post("/auth/email/forgot", json={"email": "reset@example.com"}, headers=CSRF)
    unknown = client.post("/auth/email/forgot", json={"email": "unbekannt@example.com"}, headers=CSRF)
    assert known.status_code == 200 and unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(sent) == 1 and sent[0]["to"] == "reset@example.com"

    token = sent[0]["text"].split("#smyst_pwreset=")[1].split()[0]

    # Reset mit gültigem Token → neues Passwort aktiv, direkt eingeloggt.
    reset = client.post(
        "/auth/email/reset", json={"token": token, "password": "neues-passwort-456"}, headers=CSRF
    )
    assert reset.status_code == 200
    assert reset.json()["token"].startswith("v1.")

    old_login = client.post(
        "/auth/email/login",
        json={"email": "reset@example.com", "password": "altes-passwort-123"},
        headers=CSRF,
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/auth/email/login",
        json={"email": "reset@example.com", "password": "neues-passwort-456"},
        headers=CSRF,
    )
    assert new_login.status_code == 200

    # Einmal-Verwendung: derselbe Token ist nach dem Reset ungültig.
    reuse = client.post(
        "/auth/email/reset", json={"token": token, "password": "noch-ein-passwort-789"}, headers=CSRF
    )
    assert reuse.status_code == 400
    assert reuse.json()["error"]["code"] == "invalid_reset_token"


def test_reset_rejects_garbage_token() -> None:
    response = client.post(
        "/auth/email/reset", json={"token": "v1.kaputt.kaputt", "password": "egal-egal-egal"}, headers=CSRF
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_reset_token"
