import json

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import AppConfig, Instance
from backend.models import Overview
from backend.session_detail import parse_session
from backend.transport import RunResult

EXPORT = json.dumps({
    "id": "s1", "title": "Do the thing", "model": "grok-4.3",
    "message_count": 4, "tool_call_count": 1,
    "input_tokens": 100, "output_tokens": 20, "estimated_cost_usd": 0.0123,
    "started_at": 1782733018.39, "ended_at": None, "end_reason": None,
    "messages": [
        {"role": "user", "content": "do the thing", "tool_calls": []},
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "kanban_list"}}]},
        {"role": "tool", "content": '{"tasks": []}', "tool_name": "kanban_list"},
        {"role": "assistant", "content": "Done.", "tool_calls": []},
    ],
})


def test_parse_session_meta():
    d = parse_session(EXPORT)
    assert d is not None
    assert d.meta.title == "Do the thing"
    assert d.meta.model == "grok-4.3"
    assert d.meta.tool_call_count == 1
    assert round(d.meta.cost_usd, 4) == 0.0123
    assert d.meta.started_at == 1782733018.39
    assert d.meta.ended_at is None


def test_parse_session_messages():
    d = parse_session(EXPORT)
    roles = [m.role for m in d.messages]
    assert roles == ["user", "assistant", "tool", "assistant"]
    assert d.messages[0].text == "do the thing"
    assert d.messages[1].tools == ["kanban_list"]           # assistant tool call surfaced
    assert d.messages[2].tool_name == "kanban_list"
    assert d.messages[2].result == '{"tasks": []}'
    assert d.messages[3].text == "Done."


def test_parse_session_truncates_big_tool_results():
    big = json.dumps({
        "messages": [{"role": "tool", "tool_name": "read_file", "content": "x" * 5000}],
    })
    m = parse_session(big).messages[0]
    assert m.truncated is True
    assert m.result.endswith("…")
    assert len(m.result) < 5000


def test_parse_session_garbage_is_none():
    assert parse_session("") is None
    assert parse_session("not json") is None
    assert parse_session(None) is None


# --- endpoint ---------------------------------------------------------------

class _Runner:
    def __init__(self, result):
        self.result = result
    def run(self, args, timeout=8):
        return self.result


def _client(monkeypatch, run_result):
    cfg = AppConfig(instances=[Instance(name="local", transport="local", hermes_home="/h")])

    class StubAgg:
        def __init__(self):
            self.config = cfg
        def get(self, *a, **k):
            return Overview()

    monkeypatch.setattr("backend.app.make_runner", lambda inst: _Runner(run_result))
    return TestClient(create_app(config=cfg, aggregator=StubAgg()))


def test_session_endpoint_ok(monkeypatch):
    client = _client(monkeypatch, RunResult(ok=True, stdout=EXPORT))
    r = client.get("/api/sessions/local/s1")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["title"] == "Do the thing"
    assert len(body["messages"]) == 4


def test_session_endpoint_404_on_failure(monkeypatch):
    client = _client(monkeypatch, RunResult(ok=False, stderr="no such session"))
    assert client.get("/api/sessions/local/nope").status_code == 404


def test_session_endpoint_404_unknown_instance(monkeypatch):
    client = _client(monkeypatch, RunResult(ok=True, stdout=EXPORT))
    assert client.get("/api/sessions/ghost/s1").status_code == 404
