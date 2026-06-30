import json

from backend.collectors.claude_agents import parse_claude_agents
from backend.collectors.crons import parse_crons
from backend.collectors.gateway import parse_gateway
from backend.collectors.kanban import collect_kanban
from backend.collectors.profiles import collect_profiles
from backend.collectors.reliability import parse_reliability
from backend.collectors.sessions import parse_sessions
from backend.collectors.usage import parse_usage
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


def test_reliability_configured_flag():
    # No file (None) → guard not installed → not configured.
    assert parse_reliability(None).configured is False
    # An empty file exists (guard installed, no events yet) → configured.
    assert parse_reliability("").configured is True
    # A file with events → configured.
    assert parse_reliability('{"tool":"patch","field":"path","action":"inferred"}').configured is True


# Trimmed copy of a real `hermes insights --days 7` box.
INSIGHTS = """
  ╔══════════════════════════════════════════════════════════╗
  ║                    📊 Hermes Insights                    ║
  ║                       Last 7 days                        ║
  ╚══════════════════════════════════════════════════════════╝

  Period: Jun 23, 2026 — Jun 29, 2026

  📋 Overview
  ────────────────────────────────────────────────────────
  Sessions:          18            Messages:        274
  Tool calls:        106           User messages:   33
  Input tokens:      1,299,215     Output tokens:   85,472
  Total tokens:      5,524,527
  Active time:       ~13h 47m      Avg session:     ~3h 26m

  🤖 Models Used
  ────────────────────────────────────────────────────────
  Model                          Sessions       Tokens
  grok-4.3                             17    5,501,145
  grok-build-0.1                        1       23,382

  🔧 Top Tools
  ────────────────────────────────────────────────────────
  Tool                            Calls        %
  computer_use                       25    23.6%
  patch                              21    19.8%
  terminal                           13    12.3%
"""


def test_usage_headline_numbers():
    u = parse_usage(INSIGHTS, days=7)
    assert u.days == 7
    assert u.sessions == 18
    assert u.messages == 274
    assert u.tool_calls == 106
    assert u.input_tokens == 1_299_215
    assert u.output_tokens == 85_472
    assert u.total_tokens == 5_524_527
    assert u.active_time == "~13h 47m"


def test_usage_models_and_tools():
    u = parse_usage(INSIGHTS, days=7)
    assert [m.name for m in u.models] == ["grok-4.3", "grok-build-0.1"]
    assert u.models[0].sessions == 17
    assert u.models[0].tokens == 5_501_145
    assert [t.name for t in u.top_tools] == ["computer_use", "patch", "terminal"]
    assert u.top_tools[0].calls == 25


def test_usage_empty():
    assert parse_usage("").total_tokens == 0
    assert parse_usage(None).sessions == 0


# Trimmed copy of a real `hermes sessions list` table.
SESSIONS = (
    "Title                            Preview                                  Last Active   ID\n"
    "──────────────────────────────────────────────────────────────────────────────────────\n"
    "Obsidian Vault Broken Links Ch   in my obsidian vault, we seem to have    just now      20260629_093238_06533f\n"
    "say-hi-every-minute · Jun 28 1   [IMPORTANT: You are running as a sched   19h ago       cron_6cdbc5e9096e_20260628_144020\n"
    "—                                Reply with exactly: PONG                 19h ago       20260628_143310_3e4616\n"
)


def test_sessions_parse():
    rows = parse_sessions(SESSIONS)
    assert len(rows) == 3
    assert rows[0].id == "20260629_093238_06533f"
    assert rows[0].title == "Obsidian Vault Broken Links Ch"
    assert rows[0].last_active == "just now"
    assert rows[0].preview.startswith("in my obsidian vault")
    # the em-dash placeholder title becomes empty
    assert rows[2].title == ""
    assert rows[2].id == "20260628_143310_3e4616"


def test_sessions_limit_and_empty():
    assert parse_sessions(SESSIONS, limit=1)[0].id == "20260629_093238_06533f"
    assert len(parse_sessions(SESSIONS, limit=1)) == 1
    assert parse_sessions("") == []
    assert parse_sessions(None) == []


# --- Claude agents -----------------------------------------------------------
from datetime import datetime, timezone


def _job(short, state, tempo, updated, name="n", model="opus", tokens=100, sess="sid-" + "x"):
    rf = ["--model", model] if model else []
    return (short, json.dumps({
        "daemonShort": short, "state": state, "tempo": tempo, "updatedAt": updated,
        "createdAt": "2026-06-20T00:00:00Z", "name": name, "tokens": tokens,
        "detail": "doing " + name, "cwd": "D:\\Projects\\X",
        "sessionId": sess, "respawnFlags": rf, "inFlight": {"tasks": 1},
    }))


NOW = datetime(2026, 6, 29, 12, 0, 0, tzinfo=timezone.utc)


def test_claude_agents_active_first_and_live_join():
    jobs = [
        _job("done1", "done", "idle", "2026-06-29T08:00:00Z", name="finished"),
        _job("act1", "blocked", "active", "2026-06-29T09:00:00Z", name="running-now", sess="live-sid"),
    ]
    sessions = [json.dumps({"pid": 1, "jobId": "act1", "sessionId": "live-sid", "status": "busy"})]
    agents = parse_claude_agents(jobs, sessions, now=NOW)
    assert [a.id for a in agents] == ["act1", "done1"]  # active pinned first
    assert agents[0].active is True and agents[0].live is True
    assert agents[1].active is False and agents[1].live is False


def test_claude_agents_live_busy_overrides_done_state():
    # The bug: a job whose lifecycle state reads 'done' but whose session is still live+busy
    # (between turns) must STILL count as active — a live process wins over the job state.
    jobs = [_job("s1", "done", "active", "2026-06-29T09:00:00Z", name="working")]
    sessions = [json.dumps({"pid": 1, "jobId": "s1", "sessionId": "x", "status": "busy"})]
    a = parse_claude_agents(jobs, sessions, now=NOW)[0]
    assert a.live is True
    assert a.busy is True
    assert a.active is True


def test_claude_agents_model_and_tokens():
    jobs = [_job("a", "done", "idle", "2026-06-29T09:00:00Z", model="opus", tokens=None)]
    a = parse_claude_agents(jobs, [], now=NOW)[0]
    assert a.model == "opus"
    assert a.tokens == 0          # null tokens coerced to 0
    assert a.in_flight == 1


def test_claude_agents_done_window_filter():
    jobs = [
        _job("old", "done", "idle", "2026-06-10T00:00:00Z", name="stale"),   # 19 days old
        _job("new", "done", "idle", "2026-06-28T00:00:00Z", name="fresh"),   # 1 day old
    ]
    ids = [a.id for a in parse_claude_agents(jobs, [], now=NOW, days=7)]
    assert ids == ["new"]          # stale done agent dropped, fresh kept


def test_claude_agents_empty():
    assert parse_claude_agents([], [], now=NOW) == []


def _ms(dt):
    return int(dt.timestamp() * 1000)


def test_claude_agents_interactive_session_surfaced():
    # an open `claude` terminal: kind=interactive, NO jobId -> must show as its own agent
    recent = _ms(datetime(2026, 6, 29, 11, 0, 0, tzinfo=timezone.utc))
    sessions = [json.dumps({
        "pid": 43268, "sessionId": "abc12345-zzzz", "cwd": "D:\\Projects\\LASMonitor",
        "kind": "interactive", "name": "lasmonitor-f7", "status": "busy",
        "startedAt": recent, "updatedAt": recent,
    })]
    agents = parse_claude_agents([], sessions, now=NOW)
    assert len(agents) == 1
    a = agents[0]
    assert a.kind == "interactive"
    assert a.name == "lasmonitor-f7"
    assert a.session_id == "abc12345-zzzz"
    assert a.live is True and a.busy is True and a.active is True


def test_claude_agents_background_session_not_double_counted():
    # a session WITH a jobId is the join for a background job — must not be re-added as interactive
    jobs = [_job("act1", "blocked", "active", "2026-06-29T09:00:00Z", sess="live-sid")]
    sessions = [json.dumps({"pid": 1, "jobId": "act1", "sessionId": "live-sid",
                            "kind": "interactive", "status": "busy"})]
    agents = parse_claude_agents(jobs, sessions, now=NOW)
    assert len(agents) == 1
    assert agents[0].kind == "background"


def test_claude_agents_interactive_stale_dropped_idle_named_from_cwd():
    stale = _ms(datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc))   # >7d before NOW -> dropped
    idle = _ms(datetime(2026, 6, 29, 10, 0, 0, tzinfo=timezone.utc))  # recent idle -> kept
    sessions = [
        json.dumps({"pid": 1, "sessionId": "stale1", "cwd": "D:\\a",
                    "kind": "interactive", "status": "idle", "updatedAt": stale}),
        json.dumps({"pid": 2, "sessionId": "idle1", "cwd": "D:\\Projects\\Foo",
                    "kind": "interactive", "status": "idle", "updatedAt": idle}),
    ]
    agents = parse_claude_agents([], sessions, now=NOW, days=7)
    assert len(agents) == 1
    a = agents[0]
    assert a.session_id == "idle1"
    assert a.name == "Foo"                         # derived from cwd basename
    assert a.live is True and a.active is False     # idle: live (shown) but not pinned-active
