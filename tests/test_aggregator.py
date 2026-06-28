import json

from backend.aggregator import Aggregator, build_overview
from backend.config import AppConfig
from backend.transport import RunResult
from tests.conftest import FakeRunner, make_instance


def _healthy_runner(home):
    return FakeRunner(
        runs={
            ("gateway", "status"): RunResult(ok=True, stdout="Gateway process running (PID: 1)"),
            ("kanban", "list", "--json"): RunResult(
                ok=True,
                stdout=json.dumps([{"id": "t1", "status": "running", "assignee": "researcher", "title": "x"}]),
            ),
            ("cron", "list"): RunResult(ok=True, stdout="No scheduled jobs."),
        },
        files={
            home + "/active_profile": "orchestrator\n",
            home + "/reliability/trajectories.jsonl": '{"tool":"cronjob","field":"schedule","action":"rejected","attempt":2}',
        },
        dirs={home + "/profiles": ["orchestrator", "executor"]},
        exist={home, home + "/kanban/.dispatcher.lock"},
    )


def test_healthy_and_offline_instances():
    local = make_instance(name="local", home="/h")
    vps = make_instance(name="vps", transport="ssh", home="/v")
    runners = {"local": _healthy_runner("/h"), "vps": FakeRunner(raise_on="ssh: connect timeout")}
    cfg = AppConfig(refresh_seconds=5, instances=[local, vps])

    ov = build_overview(cfg, "now", runner_factory=lambda inst: runners[inst.name])
    by = {i.name: i for i in ov.instances}

    assert by["local"].reachable is True
    assert by["local"].gateway.up is True
    assert by["local"].dispatcher.running is True
    assert by["local"].active_profile == "orchestrator"
    assert by["local"].profiles == ["orchestrator", "executor"]
    assert by["local"].kanban.counts == {"running": 1}
    assert by["local"].reliability.today.loop_breaks == 1

    assert by["vps"].reachable is False
    assert "timeout" in (by["vps"].error or "")


def test_cache_ttl_rebuilds_only_after_expiry():
    calls = {"n": 0}

    def factory(inst):
        calls["n"] += 1
        return _healthy_runner("/h")

    cfg = AppConfig(refresh_seconds=5, instances=[make_instance(home="/h")])
    agg = Aggregator(cfg, runner_factory=factory)
    agg.get("t1", now=100.0)
    agg.get("t2", now=101.0)   # within TTL -> cached
    assert calls["n"] == 1
    agg.get("t3", now=200.0)   # past TTL -> rebuild
    assert calls["n"] == 2
