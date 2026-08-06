"""Tests fuer die Avatar-SSOT-Aufloesung (backend/app/ai/avatar.py)."""

from app.ai.avatar import (
    DEFAULT_AVATAR_PLACEHOLDER,
    resolve_avatar_url,
    resolved_avatar_url,
    with_cache_buster,
)


def test_override_wins_over_owner_and_placeholder():
    assert resolve_avatar_url("/override.png", "/owner.png") == "/override.png"


def test_owner_avatar_used_when_no_override():
    assert resolve_avatar_url(None, "/owner.png") == "/owner.png"


def test_placeholder_when_nothing_set():
    assert resolve_avatar_url(None, None) == DEFAULT_AVATAR_PLACEHOLDER


def test_empty_and_whitespace_treated_as_unset():
    assert resolve_avatar_url("   ", "") == DEFAULT_AVATAR_PLACEHOLDER
    assert resolve_avatar_url("  ", "/owner.png") == "/owner.png"


def test_custom_placeholder_respected():
    assert resolve_avatar_url(None, None, "/custom.svg") == "/custom.svg"


def test_cache_buster_adds_query_when_none_present():
    assert with_cache_buster("/owner.png", 42) == "/owner.png?v=42"


def test_cache_buster_appends_with_ampersand_when_query_present():
    assert with_cache_buster("/owner.png?w=100", "abc") == "/owner.png?w=100&v=abc"


def test_cache_buster_noop_without_version():
    assert with_cache_buster("/owner.png", None) == "/owner.png"
    assert with_cache_buster("/owner.png", "") == "/owner.png"


def test_cache_buster_noop_on_empty_url():
    assert with_cache_buster("", 42) == ""


def test_resolved_avatar_url_end_to_end_owner_with_version():
    assert resolved_avatar_url(None, "/owner.png", version=7) == "/owner.png?v=7"


def test_resolved_avatar_url_override_with_version():
    assert (
        resolved_avatar_url("/override.png", "/owner.png", version="h4sh")
        == "/override.png?v=h4sh"
    )


def test_resolved_avatar_url_placeholder_gets_no_cache_buster():
    assert resolved_avatar_url(None, None, version=7) == DEFAULT_AVATAR_PLACEHOLDER
