from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import AppConfig
from backend.models import InstanceOverview, Overview


class StubAgg:
    def __init__(self, ov):
        self.ov = ov

    def get(self, now_iso, now=None):
        return self.ov


def test_overview_endpoint_returns_contract():
    ov = Overview(refresh_seconds=7, instances=[InstanceOverview(name="local", transport="local")])
    app = create_app(config=AppConfig(instances=[]), aggregator=StubAgg(ov))
    client = TestClient(app)

    r = client.get("/api/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["refresh_seconds"] == 7
    assert body["instances"][0]["name"] == "local"
    assert body["instances"][0]["gateway"]["up"] is False
