"""Tests fuer die Rollen-Zuteilung (_roles_for_email).

Inhaber-Anweisung 23.09.2026: Admin sind NUR smyst247@gmail.com und
alanbestus@gmail.com — code-seitig abgesichert, auch wenn die Env-Listen
(SMYST_OWNER_EMAILS/SMYST_ADMIN_EMAILS) im Deployment fehlen.
"""

from __future__ import annotations

from app.api.v1.routes.auth import _permissions_for_roles, _roles_for_email


def test_inhaber_konto_bekommt_owner() -> None:
    assert _roles_for_email("smyst247@gmail.com") == ["owner"]


def test_zweites_admin_konto_bekommt_admin() -> None:
    assert _roles_for_email("alanbestus@gmail.com") == ["admin"]


def test_grosskleinschreibung_und_leerzeichen_egal() -> None:
    assert _roles_for_email("  SMYST247@GMAIL.COM ") == ["owner"]
    assert _roles_for_email("AlanBestus@Gmail.com") == ["admin"]


def test_fremdes_konto_bleibt_member() -> None:
    assert _roles_for_email("irgendwer@example.com") == ["member"]


def test_owner_und_admin_haben_admin_leserechte() -> None:
    assert "admin:read" in _permissions_for_roles(["owner"])
    assert "admin:write" in _permissions_for_roles(["owner"])
    assert "admin:read" in _permissions_for_roles(["admin"])
    assert "admin:write" not in _permissions_for_roles(["admin"])
    assert "admin:read" not in _permissions_for_roles(["member"])
