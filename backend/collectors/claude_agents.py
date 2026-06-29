from __future__ import annotations

import json
from datetime import datetime, timezone

from backend.models import ClaudeAgent

# Claude Code keeps a per-agent state file at ~/.claude/jobs/<id>/state.json and a
# live process registry at ~/.claude/sessions/<pid>.json. We enumerate background
# agents from jobs/, join the sessions registry by jobId to learn which are live,
# and present active ones first with recent history below.

_TASK_MAX = 200


def collect_claude_agents(runner, claude_home: str, days: int = 7, limit: int = 50,
                          now: datetime | None = None) -> list[ClaudeAgent]:
    if not claude_home:
        return []
    home = claude_home.rstrip("/\\")
    jobs_dir = f"{home}/jobs"
    sessions_dir = f"{home}/sessions"

    job_entries: list[tuple[str, str]] = []
    for jid in runner.list_dir(jobs_dir):
        text = runner.read(f"{jobs_dir}/{jid}/state.json")
        if text:
            job_entries.append((jid, text))

    session_texts: list[str] = []
    for name in _list_files(runner, sessions_dir):
        if not name.endswith(".json"):
            continue
        text = runner.read(f"{sessions_dir}/{name}")
        if text:
            session_texts.append(text)

    return parse_claude_agents(job_entries, session_texts, now=now, days=days, limit=limit)


def _list_files(runner, path: str) -> list[str]:
    # `sessions/` holds files, not dirs. LocalRunner.list_dir returns dirs only, so
    # prefer list_files; SshRunner.list_dir already returns files, so it's the fallback.
    lister = getattr(runner, "list_files", None) or runner.list_dir
    try:
        return lister(path)
    except Exception:
        return []


def _model_from_flags(flags) -> str:
    if isinstance(flags, list) and "--model" in flags:
        i = flags.index("--model")
        if i + 1 < len(flags):
            return str(flags[i + 1])
    return ""


def _parse_iso(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def parse_claude_agents(job_entries, session_texts, now: datetime | None = None,
                        days: int = 7, limit: int = 50) -> list[ClaudeAgent]:
    now = now or datetime.now(timezone.utc)

    # jobId (short) -> live session info
    live_by_job: dict[str, dict] = {}
    for text in session_texts:
        try:
            s = json.loads(text)
        except Exception:
            continue
        if not isinstance(s, dict):
            continue
        jid = s.get("jobId")
        if jid:
            live_by_job[str(jid)] = s

    agents: list[ClaudeAgent] = []
    for jid, text in job_entries:
        try:
            j = json.loads(text)
        except Exception:
            continue
        if not isinstance(j, dict):
            continue

        state = str(j.get("state") or "")
        tempo = str(j.get("tempo") or "")
        sess = live_by_job.get(str(jid)) or live_by_job.get(str(j.get("daemonShort") or ""))
        live = sess is not None
        busy = bool(sess and str(sess.get("status") or "").lower() == "busy")
        # A live session process means the agent is open/working RIGHT NOW — that wins over
        # the job's lifecycle `state`, which can read "done" between turns while the session
        # is still alive and busy. Fall back to tempo for jobs with no live session.
        active = live or (state != "done" and tempo == "active")

        in_flight = 0
        infl = j.get("inFlight")
        if isinstance(infl, dict):
            in_flight = int(infl.get("tasks") or 0)

        task = str(j.get("detail") or "")
        if len(task) > _TASK_MAX:
            task = task[:_TASK_MAX].rstrip() + "…"

        agents.append(ClaudeAgent(
            id=str(j.get("daemonShort") or jid),
            name=str(j.get("name") or ""),
            task=task,
            state=state,
            model=_model_from_flags(j.get("respawnFlags")),
            tokens=int(j.get("tokens") or 0),
            in_flight=in_flight,
            cwd=str(j.get("cwd") or ""),
            session_id=str(j.get("sessionId") or ""),
            created_at=str(j.get("createdAt") or ""),
            updated_at=str(j.get("updatedAt") or ""),
            live=live,
            busy=busy,
            active=active,
        ))

    # Filter: keep active/live always; keep done/idle only if updated within `days`.
    kept: list[ClaudeAgent] = []
    for a in agents:
        if a.active or a.live:
            kept.append(a)
            continue
        ts = _parse_iso(a.updated_at)
        if ts is None:
            kept.append(a)  # unknown age — don't silently drop
        elif (now - ts).total_seconds() <= days * 86400:
            kept.append(a)

    # Sort: active block first, then most-recently-updated within each block.
    kept.sort(key=lambda a: (0 if a.active else 1, -_sort_ts(a.updated_at)))
    return kept[:limit]


def _sort_ts(s: str) -> float:
    dt = _parse_iso(s)
    return dt.timestamp() if dt else 0.0
