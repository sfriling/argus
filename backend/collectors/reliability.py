from __future__ import annotations

import json

from backend.models import Reliability, ReliabilityEvent, ReliabilityToday


def collect_reliability(runner, instance) -> Reliability:
    path = getattr(instance, "reliability_log", None)
    if not path:
        path = instance.hermes_home.rstrip("/\\") + "/reliability/trajectories.jsonl"
    return parse_reliability(runner.read(path))


def parse_reliability(text: str | None) -> Reliability:
    # text is None when the trajectory log doesn't exist → the guard plugin isn't installed.
    # An empty string means the file exists but has no events yet (installed, quiet).
    configured = text is not None
    if not text:
        return Reliability(configured=configured)
    events: list[dict] = []
    for line in [ln for ln in text.splitlines() if ln.strip()][-200:]:
        try:
            e = json.loads(line)
        except Exception:
            continue
        if isinstance(e, dict):
            events.append(e)

    catches = sum(1 for e in events if e.get("action") in ("rejected", "inferred"))
    loop_breaks = sum(1 for e in events if _as_int(e.get("attempt")) >= 2)
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
