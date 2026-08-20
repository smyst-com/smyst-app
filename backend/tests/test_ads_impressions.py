"""25%-Modell: Werbe-Impressions-Zaehlung (POST /ads/impression, GET /ads/stats)."""
from fastapi.testclient import TestClient
from app.api.v1.routes import ads as ads_route
from app.main import app

client = TestClient(app)

def test_impression_counts_and_stats() -> None:
    ads_route._STATS.clear()
    assert client.post("/api/v1/ads/impression", json={"slug": "albert-einstein"}).status_code == 200
    assert client.post("/api/v1/ads/impression", json={"slug": "albert-einstein"}).status_code == 200
    assert client.post("/api/v1/ads/impression", json={"slug": "platon"}).status_code == 200
    stats = client.get("/api/v1/ads/stats").json()
    assert stats["total"] == 3
    assert stats["profiles"]["albert-einstein"] == 2

def test_impression_rejects_empty_slug() -> None:
    assert client.post("/api/v1/ads/impression", json={"slug": ""}).status_code == 422
