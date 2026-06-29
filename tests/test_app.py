from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import AppConfig
from backend.models import InstanceOverview, Overview


class StubAgg:
    def __init__(self, ov, config=None):
        self.ov = ov
        self.config = config or AppConfig(instances=[])
        self.replaced = None

    def get(self, now_iso, now=None):
        return self.ov

    def replace_config(self, new_config):
        self.replaced = new_config
        self.config = new_config


def _ov():
    return Overview(refresh_seconds=7, instances=[InstanceOverview(name="local", transport="local")])


def test_overview_endpoint_returns_contract():
    app = create_app(config=AppConfig(instances=[]), aggregator=StubAgg(_ov()))
    client = TestClient(app)

    r = client.get("/api/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["refresh_seconds"] == 7
    assert body["instances"][0]["name"] == "local"
    assert body["instances"][0]["gateway"]["up"] is False


def test_get_config_reports_meta(monkeypatch, tmp_path):
    monkeypatch.delenv("ARGUS_BIND_HOST", raising=False)
    monkeypatch.setenv("ARGUS_CONFIG", str(tmp_path / "config.yaml"))
    cfg = AppConfig(instances=[], enable_config_writes=False)
    app = create_app(config=cfg, aggregator=StubAgg(_ov(), cfg))
    client = TestClient(app)

    r = client.get("/api/config")
    assert r.status_code == 200
    meta = r.json()["meta"]
    assert meta["writable"] is False           # writes not enabled
    assert meta["localhost_bound"] is True
    assert meta["writes_enabled"] is False


def test_put_config_blocked_when_writes_disabled(monkeypatch, tmp_path):
    monkeypatch.delenv("ARGUS_BIND_HOST", raising=False)
    monkeypatch.setenv("ARGUS_CONFIG", str(tmp_path / "config.yaml"))
    cfg = AppConfig(instances=[], enable_config_writes=False)
    app = create_app(config=cfg, aggregator=StubAgg(_ov(), cfg))
    client = TestClient(app)

    r = client.put("/api/config", json={"instances": []})
    assert r.status_code == 403


def test_put_config_blocked_when_not_localhost(monkeypatch, tmp_path):
    monkeypatch.setenv("ARGUS_BIND_HOST", "0.0.0.0")  # exposed
    monkeypatch.setenv("ARGUS_CONFIG", str(tmp_path / "config.yaml"))
    cfg = AppConfig(instances=[], enable_config_writes=True)
    app = create_app(config=cfg, aggregator=StubAgg(_ov(), cfg))
    client = TestClient(app)

    r = client.put("/api/config", json={"instances": []})
    assert r.status_code == 403


def test_put_config_rejects_invalid(monkeypatch, tmp_path):
    monkeypatch.delenv("ARGUS_BIND_HOST", raising=False)
    monkeypatch.setenv("ARGUS_CONFIG", str(tmp_path / "config.yaml"))
    cfg = AppConfig(instances=[], enable_config_writes=True)
    app = create_app(config=cfg, aggregator=StubAgg(_ov(), cfg))
    client = TestClient(app)

    # ssh instance missing its key → 422
    r = client.put("/api/config", json={"instances": [{"name": "vps", "transport": "ssh"}]})
    assert r.status_code == 422


def test_put_config_happy_path_writes_and_reloads(monkeypatch, tmp_path):
    monkeypatch.delenv("ARGUS_BIND_HOST", raising=False)
    cfg_path = tmp_path / "config.yaml"
    monkeypatch.setenv("ARGUS_CONFIG", str(cfg_path))
    cfg = AppConfig(instances=[], enable_config_writes=True)
    agg = StubAgg(_ov(), cfg)
    app = create_app(config=cfg, aggregator=agg)
    client = TestClient(app)

    new = {
        "enable_config_writes": True,
        "port": 8800,
        "instances": [{"name": "local", "transport": "local", "hermes_home": "/h"}],
    }
    r = client.put("/api/config", json=new)
    assert r.status_code == 200
    assert cfg_path.is_file()                       # persisted
    assert agg.replaced is not None                 # aggregator reloaded
    assert agg.replaced.port == 8800
