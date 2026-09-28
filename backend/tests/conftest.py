"""Gemeinsame Test-Fixtures.

Der In-Memory-Rate-Limiter ist global; ohne Reset wuerden die strikteren
Pfad-Limits (z. B. 10/min fuer /auth/email/*) andere Tests verfaelschen,
sobald sie in einer Suite laufeen.
"""

from __future__ import annotations

import pytest

from app.security import session_revocation
from app.security.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    rate_limiter._buckets.clear()
    session_revocation.reset_cache_for_tests()
