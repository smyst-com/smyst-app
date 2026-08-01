"""Tests fuer die Admin-Qualitaetssicht (Aggregations-Worker + Endpoint)."""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi.testclient import TestClient

import app.api.v1.routes.admin_quality as admin_quality_route
from app.api.v1.routes.auth import _make_token
from app.main import app
from app.workers.report_quality import build_quality_summary

NOW = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)

DOCS = [
    {
        "wikidata_qid": "Q1",
        "name": "Profil Gut",
        "eval_report": {"score": 1.0, "regression": False, "finished_at": "2026-08-01T06:00:00+00:00"},
        "refresh": {"checked_at": "2026-08-01T06:00:00+00:00", "needs_review": False},
    },
    {
        "wikidata_qid": "Q2",
        "name": "Profil Regression",
        "eval_report": {
            "score": 0.5,
            "previous_score": 0.9,
            "regression": True,
            "finished_at": "2026-08-01T06:00:00+00:00",
            "issues": ["Eval profile_birth: erwarteter Text '1809' fehlt in der Antwort"],
        },
        "refresh": {"checked_at": "2026-07-01T06:00:00+00:00", "needs_review": True, "changed": True},
    },
    {"wikidata_qid": "Q3", "name": "Profil Neu"},
]


def test_build_quality_summary_aggregates_scores_reviews_and_counts() -> None:
    summary = build_quality_summary(DOCS, now=NOW)
    assert summary["counts"] == {
        "published": 3,
        "evaluated": 2,
        "regressions": 1,
        "needs_review": 1,
        "refresh_checked": 2,
        "score_below_0_8": 1,
    }
    assert summary["average_score"] == 0.75
    assert summary["worst_evals"][0]["qid"] == "Q2"  # schlechtester Score zuerst
    assert summary["regressions"][0]["previous_score"] == 0.9
    assert summary["needs_review"][0]["qid"] == "Q2"


def _session_cookie(roles: list[str], permissions: list[str]) -> dict[str, str]:
    token = _make_token(
        {
            "sub": "user-1",
            "email": "admin@example.com",
            "roles": roles,
            "permissions": permissions,
            "expiresAt": int(time.time() * 1000) + 3_600_000,
        }
    )
    return {"smyst_session": token}


def test_quality_endpoint_requires_admin(monkeypatch) -> None:
    client = TestClient(app)
    assert client.get("/api/admin/quality").status_code == 401

    member = client.get(
        "/api/admin/quality", cookies=_session_cookie(["member"], ["auth:read"])
    )
    assert member.status_code == 403


def test_quality_endpoint_returns_summary_and_feedback(monkeypatch) -> None:
    summary = build_quality_summary(DOCS, now=NOW)
    monkeypatch.setattr(admin_quality_route.quality_store, "load_summary", lambda: summary)
    monkeypatch.setattr(
        admin_quality_route.feedback_store,
        "list_feedback",
        lambda twin_id=None, *, limit=50: [
            {"twinId": "mata-hari", "rating": "down", "question": "Frage?", "answer": "A", "createdAt": 2},
            {"twinId": "mata-hari", "rating": "up", "question": "Ok?", "answer": "B", "createdAt": 5},
        ],
    )
    client = TestClient(app)
    response = client.get(
        "/api/admin/quality", cookies=_session_cookie(["admin"], ["admin:read"])
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["summary"]["counts"]["published"] == 3
    assert payload["feedback"]["down_or_report"] == 1
    # neuestes Feedback zuerst
    assert payload["feedback"]["recent"][0]["rating"] == "up"
