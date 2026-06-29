from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import AppConfig, Instance, skill_review_available
from backend.models import Overview, ReviewReport
import json
import sys

from backend.skill_review import (
    triage, skill_drift, report_from_tool_input, review,
    build_cli_prompt, parse_cli_result,
)
from backend.transport import RunResult


# --- triage (pure) -----------------------------------------------------------

def _sess(sid):
    class S:  # minimal duck-typed session with .id
        id = sid
    s = S(); s.id = sid
    return s


def test_triage_ranks_strugglers_first():
    events = [
        {"session_id": "loop", "action": "rejected", "attempt": 2},   # loop-break = high
        {"session_id": "infer", "action": "inferred"},                # low
    ]
    sessions = [_sess("recent1"), _sess("loop"), _sess("infer"), _sess("recent2")]
    out = triage(events, sessions, limit=4)
    assert out[0] == "loop"          # highest struggle score first
    assert out[1] == "infer"
    assert "recent1" in out          # recents fill remaining slots
    assert len(out) == 4


def test_triage_no_trajectory_uses_recent():
    out = triage([], [_sess("a"), _sess("b"), _sess("c")], limit=2)
    assert out == ["a", "b"]


# --- drift (pure) ------------------------------------------------------------

def test_skill_drift_flags_divergence():
    drift = skill_drift({"local": {"x", "y"}, "vps": {"x", "z"}})
    concerns = " ".join(d.concern for d in drift)
    assert "'y'" in concerns and "'z'" in concerns

def test_skill_drift_none_when_identical():
    assert skill_drift({"local": {"x"}, "vps": {"x"}}) == []
    assert skill_drift({"local": {"x"}}) == []   # single instance → nothing to compare


# --- structured-output parse + review() with a fake client -------------------

def test_report_from_tool_input():
    data = {
        "summary": "one gap",
        "gaps": [{"title": "patch", "recommendation": "harden", "target_skill": "obsidian",
                  "evidence": "session s1", "suggested_edit": "add a checklist"}],
        "health": [{"skill": "obsidian", "finding": "subtle", "severity": "warn"}],
    }
    r = report_from_tool_input(data, "local", "claude-opus-4-8", ["s1"], "2026-06-29T00:00:00Z")
    assert r.summary == "one gap"
    assert r.gaps[0].target_skill == "obsidian"
    assert r.health[0].severity == "warn"
    assert r.sessions_reviewed == ["s1"]


class _Block:
    type = "tool_use"
    name = "submit_review"
    def __init__(self, data):
        self.input = data

class _Resp:
    def __init__(self, data):
        self.content = [_Block(data)]

class _Messages:
    def __init__(self, data):
        self._data = data
    def create(self, **kwargs):
        return _Resp(self._data)

class _FakeClient:
    def __init__(self, data):
        self.messages = _Messages(data)


def test_review_parses_tool_use():
    fake = _FakeClient({"summary": "ok", "gaps": [], "health": []})
    r = review("ctx", "m", "key", "local", ["s1"], "now", client=fake)
    assert isinstance(r, ReviewReport)
    assert r.summary == "ok"
    assert r.model == "m"


# --- gating ------------------------------------------------------------------

def test_skill_review_available_truth_table(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    on = AppConfig(enable_skill_review=True, host="127.0.0.1")
    assert skill_review_available(on) is True                          # key present
    assert skill_review_available(on, bind_host="0.0.0.0") is False    # not localhost
    assert skill_review_available(AppConfig(enable_skill_review=False, host="127.0.0.1")) is False
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # no key + no Claude CLI → unavailable
    no_cli = AppConfig(enable_skill_review=True, host="127.0.0.1", claude_bin="definitely-not-a-real-binary-xyz")
    assert skill_review_available(no_cli) is False
    # no key + a Claude CLI on PATH → available (subscription path). Use this interpreter as a stand-in.
    on_cli = AppConfig(enable_skill_review=True, host="127.0.0.1", claude_bin=sys.executable)
    assert skill_review_available(on_cli) is True


def test_build_cli_prompt_has_schema():
    p = build_cli_prompt("THE CONTEXT")
    assert "JSON object" in p and "THE CONTEXT" in p


def test_parse_cli_result_plain_and_fenced():
    body = {"summary": "s", "gaps": [], "health": []}
    plain = json.dumps({"result": json.dumps(body)})
    assert parse_cli_result(plain)["summary"] == "s"
    fenced = json.dumps({"result": "```json\n" + json.dumps(body) + "\n```"})
    assert parse_cli_result(fenced)["summary"] == "s"


def test_review_via_cli_path():
    stdout = json.dumps({"result": json.dumps({"summary": "from-cli", "gaps": [], "health": []})})
    def fake_run(claude_bin, model, prompt):
        return stdout
    r = review("ctx", "m", "", "local", ["s1"], "now", claude_bin="claude", run=fake_run)
    assert r.summary == "from-cli"          # no key + no client → CLI path


def _client(monkeypatch, cfg, run_result=None):
    monkeypatch.delenv("ARGUS_BIND_HOST", raising=False)

    class StubAgg:
        def __init__(self):
            self.config = cfg
        def get(self, *a, **k):
            return Overview()

    class _Runner:
        def run(self, args, timeout=8):
            return run_result or RunResult(ok=True, stdout="")
        def read(self, path, timeout=8):
            return None
    monkeypatch.setattr("backend.app.make_runner", lambda inst: _Runner())
    return TestClient(create_app(config=cfg, aggregator=StubAgg()))


def test_run_blocked_when_disabled(monkeypatch):
    cfg = AppConfig(instances=[Instance(name="local", transport="local", hermes_home="/h")],
                    enable_skill_review=False)
    client = _client(monkeypatch, cfg)
    assert client.post("/api/skill-review/local/run").status_code == 403


def test_run_happy_path_with_mocked_review(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    cfg = AppConfig(instances=[Instance(name="local", transport="local", hermes_home="/h")],
                    enable_skill_review=True)
    client = _client(monkeypatch, cfg)
    monkeypatch.setattr("backend.app.sr.review",
                        lambda *a, **k: ReviewReport(summary="mocked", model="m"))
    r = client.post("/api/skill-review/local/run")
    assert r.status_code == 200
    assert r.json()["summary"] == "mocked"


def test_overview_exposes_skill_review_feature(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    cfg = AppConfig(instances=[], enable_skill_review=True)
    client = _client(monkeypatch, cfg)
    body = client.get("/api/overview").json()
    assert body["features"]["skill_review"] is True
