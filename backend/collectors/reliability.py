from __future__ import annotations

import json
from datetime import date

from backend.models import Reliability, ReliabilityEvent, ReliabilityToday


def collect_reliability(runner, instance) -> Reliability:
    path = getattr(instance, "reliability_log", None)
    if not path:
        path = instance.hermes_home.rstrip("/\\") + "/reliability/trajectories.jsonl"
    return parse_reliability(runner.read(path))


def parse_reliability(text: str | None, today: str | None = None) -> Reliability:
    # text is None when the trajectory log doesn't exist → the guard plugin isn't installed.
    # An empty string means the file exists but has no events yet (installed, quiet).
    #
    # The "today" tally is filtered by the Argus host's local date (YYYYMMDD). Trajectory
    # events carry no timestamp field, so their date is parsed from the YYYYMMDD_HHMMSS
    # prefix of session_id/turn_id. `today` is injectable for testing; defaults to the
    # host's current local date.
    configured = text is not None
    if not text:
        return Reliability(configured=configured)
    if today is None:
        today = date.today().strftime("%Y%m%d")
    events: list[dict] = []
    for line in [ln for ln in text.splitlines() if ln.strip()][-200:]:
        try:
            e = json.loads(line)
        except Exception:
            continue
        if isinstance(e, dict):
            events.append(e)

    today_events = [e for e in events if _event_date(e) == today]
    catches = sum(1 for e in today_events if e.get("action") in ("rejected", "inferred"))
    # One looping turn re-issues the same call across attempts 2..N; count it once by
    # collapsing loop-break events (attempt >= 2) onto their turn.
    loop_turns = {
        _turn_key(e) for e in today_events if _as_int(e.get("attempt")) >= 2
    }
    loop_breaks = len(loop_turns)
    recent = [
        ReliabilityEvent(
            tool=str(e.get("tool") or ""),
            field=str(e.get("field") or ""),
            action=str(e.get("action") or ""),
            attempt=_as_int(e.get("attempt")),
        )
        for e in events[-10:]
    ][::-1]
    return Reliability(
        configured=True,
        today=ReliabilityToday(catches=catches, loop_breaks=loop_breaks),
        recent=recent,
    )


def _as_int(v) -> int:
    try:
        return int(v)
    except Exception:
        return 0


def _event_date(e: dict) -> str:
    # Events carry no timestamp; the date is the YYYYMMDD prefix of session_id (or turn_id,
    # whose first colon-segment is the session_id). Returns "" if no parseable date.
    raw = str(e.get("session_id") or "")
    if not raw:
        raw = str(e.get("turn_id") or "").split(":", 1)[0]
    head = raw[:8]
    return head if len(head) == 8 and head.isdigit() else ""


def _turn_key(e: dict):
    # Identify the loop a loop-break belongs to, so escalating attempts collapse to one.
    # turn_id is "<session>:<turn>:<call_hash>" where the trailing hash is per-call, so the
    # full turn_id is NOT stable across a loop's attempts. A loop is one (turn, tool, field)
    # that escalated (the guard's own escalation key), where turn = the middle segment.
    turn_id = str(e.get("turn_id") or "")
    parts = turn_id.split(":")
    turn = parts[1] if len(parts) >= 2 and parts[1] else str(e.get("session_id") or id(e))
    return (turn, str(e.get("tool") or ""), str(e.get("field") or ""))
