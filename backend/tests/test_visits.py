"""Besucher-Zaehlung: POST /visits + GET /visits/stats."""
from fastapi.testclient import TestClient
from app.api.v1.routes import visits as visits_route
from app.main import app

client = TestClient(app)

def test_visit_counting_and_stats() -> None:
    visits_route._STATS.clear()
    assert client.post("/api/v1/visits", json={"slug": "albert-einstein"}).status_code == 200
    assert client.post("/api/v1/visits", json={"slug": "albert-einstein"}).status_code == 200
    assert client.post("/api/v1/visits", json={"slug": "platon"}).status_code == 200
    stats = client.get("/api/v1/visits/stats").json()
    assert stats["totalAll"] == 3
    assert stats["profiles"]["albert-einstein"]["total"] == 2

def test_visit_rejects_empty() -> None:
    assert client.post("/api/v1/visits", json={"slug": ""}).status_code == 422
