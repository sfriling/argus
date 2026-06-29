import json

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import AppConfig, Instance, actions_writable
from backend.kanban_actions import ActionError, verb_to_argv, read_board, read_assignees
from backend.models import Overview
from backend.transport import RunResult


# --- verb_to_argv (the pure write seam) -------------------------------------

def test_verb_create():
    assert verb_to_argv("create", None, {"title": "Do thing"}) == ["create", "Do thing"]
    assert verb_to_argv("create", None, {"title": "T", "body": "b", "assignee": "executor"}) == [
        "create", "T", "--body", "b", "--assignee", "executor",
    ]


def test_verb_create_requires_title():
    with pytest.raises(ActionError):
        verb_to_argv("create", None, {"title": "  "})


def test_verb_simple_transitions():
    for v in ("promote", "block", "unblock", "complete", "archive"):
        assert verb_to_argv(v, "t_1", {}) == [v, "t_1"]


def test_verb_comment_and_assign():
    assert verb_to_argv("comment", "t_1", {"body": "hi"}) == ["comment", "t_1", "hi"]
    assert verb_to_argv("assign", "t_1", {"assignee": "planner"}) == ["assign", "t_1", "planner"]


def test_verb_requires_task_id():
    with pytest.raises(ActionError):
        verb_to_argv("complete", None, {})


def test_verb_unknown_rejected():
    with pytest.raises(ActionError):
        verb_to_argv("dispatch", "t_1", {})        # agent-only verb not exposed
    with pytest.raises(ActionError):
        verb_to_argv("nonsense", "t_1", {})


def test_actions_writable_guard():
    on = AppConfig(enable_actions=True, host="127.0.0.1")
    assert actions_writable(on) is True
    assert actions_writable(on, bind_host="0.0.0.0") is False
    assert actions_writable(AppConfig(enable_actions=False, host="127.0.0.1")) is False


# --- read_board parsing ------------------------------------------------------

class _Runner:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def run(self, args, timeout=8):
        self.calls.append(args)
        return self.result


def test_read_board_parses_list():
    data = [{"id": "t1", "title": "A", "status": "ready"}]
    tasks = read_board(_Runner(RunResult(ok=True, stdout=json.dumps(data))), None)
    assert [t["id"] for t in tasks] == ["t1"]


def test_read_board_bad_json_is_empty():
    assert read_board(_Runner(RunResult(ok=True, stdout="nonsense")), None) == []


def test_read_assignees_returns_profile_names():
    data = [
        {"name": "executor", "on_disk": True, "counts": {}},
        {"name": "planner", "on_disk": True, "counts": {}},
        {"name": "ghost", "on_disk": False, "counts": {}},   # not on disk → excluded
    ]
    names = read_assignees(_Runner(RunResult(ok=True, stdout=json.dumps(data))), None)
    assert names == ["executor", "planner"]


def test_read_assignees_failure_is_empty():
    assert read_assignees(_Runner(RunResult(ok=False)), None) == []


# --- endpoints ---------------------------------------------------------------

def _app(monkeypatch, enable_actions, run_result=None, bind_host=None):
    if bind_host is not None:
        monkeypatch.setenv("ARGUS_BIND_HOST", bind_host)
    else:
        monkeypatch.delenv("ARGUS_BIND_HOST", raising=False)
    cfg = AppConfig(
        instances=[Instance(name="local", transport="local", hermes_home="/h")],
        enable_actions=enable_actions,
    )

    class StubAgg:
        def __init__(self):
            self.config = cfg
        def get(self, *a, **k):
            return Overview()

    runner = _Runner(run_result or RunResult(ok=True, stdout="ok"))
    monkeypatch.setattr("backend.app.make_runner", lambda inst: runner)
    app = create_app(config=cfg, aggregator=StubAgg())
    return TestClient(app), runner


def test_action_blocked_when_disabled(monkeypatch):
    client, _ = _app(monkeypatch, enable_actions=False)
    r = client.post("/api/kanban/local/action", json={"verb": "complete", "task_id": "t_1"})
    assert r.status_code == 403


def test_action_rejects_unknown_verb(monkeypatch):
    client, _ = _app(monkeypatch, enable_actions=True)
    r = client.post("/api/kanban/local/action", json={"verb": "dispatch", "task_id": "t_1"})
    assert r.status_code == 422


def test_action_happy_path_invokes_cli(monkeypatch):
    client, runner = _app(monkeypatch, enable_actions=True)
    r = client.post("/api/kanban/local/action", json={"verb": "complete", "task_id": "t_1"})
    assert r.status_code == 200
    assert runner.calls[-1] == ["kanban", "complete", "t_1"]


def test_action_unknown_instance_404(monkeypatch):
    client, _ = _app(monkeypatch, enable_actions=True)
    r = client.post("/api/kanban/ghost/action", json={"verb": "complete", "task_id": "t_1"})
    assert r.status_code == 404


def test_board_endpoint_returns_meta(monkeypatch):
    data = [{"id": "t1", "title": "A", "status": "ready"}]
    client, _ = _app(monkeypatch, enable_actions=True, run_result=RunResult(ok=True, stdout=json.dumps(data)))
    r = client.get("/api/kanban/local/board")
    assert r.status_code == 200
    body = r.json()
    assert body["tasks"][0]["id"] == "t1"
    assert body["meta"]["writable"] is True
