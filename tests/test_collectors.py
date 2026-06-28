import json

from backend.collectors.crons import parse_crons
from backend.collectors.gateway import parse_gateway
from backend.collectors.kanban import collect_kanban
from backend.collectors.profiles import collect_profiles
from backend.collectors.reliability import parse_reliability
from backend.transport import RunResult
from tests.conftest import FakeRunner, make_instance


def test_gateway_up_down_active():
    assert parse_gateway("✓ Gateway process running (PID: 27972)").up is True
    assert parse_gateway("✗ Gateway is not running").up is False
    assert parse_gateway("Active: active (running) since Sun").up is True


def test_profiles_collect():
    home = "/h"
    r = FakeRunner(files={home + "/active_profile": "orchestrator\n"},
                   dirs={home + "/profiles": ["orchestrator", "executor"]})
    active, profiles = collect_profiles(r, make_instance(home=home))
    assert active == "orchestrator"
    assert profiles == ["orchestrator", "executor"]


def test_kanban_counts_and_inflight():
    data = [
        {"id": "t1", "status": "running", "assignee": "researcher", "title": "a"},
        {"id": "t2", "status": "done", "title": "b"},
        {"id": "t3", "status": "ready", "assignee": "executor", "title": "c"},
    ]
    r = FakeRunner(runs={("kanban", "list", "--json"): RunResult(ok=True, stdout=json.dumps(data))})
    kb = collect_kanban(r, make_instance())
    assert kb.counts == {"running": 1, "done": 1, "ready": 1}
    assert [t.id for t in kb.in_flight] == ["t1", "t3"]  # done excluded


def test_kanban_bad_json_is_empty():
    r = FakeRunner(runs={("kanban", "list", "--json"): RunResult(ok=True, stdout="not json")})
    assert collect_kanban(r, make_instance()).counts == {}


def test_crons_parse():
    text = """
  c3 [active]
    Name:      Vault Health Check
    Schedule:  0 9 * * 4
    Next run:  2026-07-02T09:00:00+00:00
    Last run:  2026-06-25T09:02:37  ok
"""
    crons = parse_crons(text)
    assert len(crons) == 1
    assert crons[0].name == "Vault Health Check"
    assert crons[0].schedule == "0 9 * * 4"
    assert crons[0].next_run == "2026-07-02T09:00:00+00:00"
    assert crons[0].last_status == "ok"


def test_crons_empty():
    assert parse_crons("No scheduled jobs.") == []


def test_reliability_counts_and_order():
    lines = [
        '{"tool":"patch","field":"path","action":"inferred","attempt":1}',
        '{"tool":"cronjob","field":"schedule","action":"rejected","attempt":1}',
        '{"tool":"cronjob","field":"schedule","action":"rejected","attempt":2}',
    ]
    rel = parse_reliability("\n".join(lines))
    assert rel.today.catches == 3
    assert rel.today.loop_breaks == 1
    assert rel.recent[0].action == "rejected" and rel.recent[0].attempt == 2  # newest first


def test_reliability_missing_file():
    assert parse_reliability(None).today.catches == 0
