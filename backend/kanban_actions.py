"""Kanban board read + write, backed by the `hermes kanban` CLI over the transport.

Argus does not reimplement task logic — Hermes owns the durable board. We read with
`kanban list/show --json` and write with the human-facing CLI verbs only. The agent-only
verbs (dispatch/decompose/swarm/claim/reclaim) are intentionally NOT exposed."""
from __future__ import annotations

import json
from typing import Any, Optional


class ActionError(ValueError):
    """Raised for an unknown verb or missing/invalid args — surfaced as HTTP 422."""


# Human verbs only. Value = how to build the CLI argv tail from (task_id, args).
def verb_to_argv(verb: str, task_id: Optional[str], args: dict[str, Any]) -> list[str]:
    """Translate a board action into a `hermes kanban …` argv tail. Pure + validated."""
    args = args or {}

    if verb == "create":
        title = str(args.get("title") or "").strip()
        if not title:
            raise ActionError("create requires a non-empty 'title'")
        argv = ["create", title]
        if args.get("body"):
            argv += ["--body", str(args["body"])]
        if args.get("assignee"):
            argv += ["--assignee", str(args["assignee"])]
        return argv

    # All other verbs act on an existing task.
    if not task_id:
        raise ActionError(f"{verb} requires a task_id")

    if verb == "comment":
        body = str(args.get("body") or "").strip()
        if not body:
            raise ActionError("comment requires a non-empty 'body'")
        return ["comment", task_id, body]

    if verb == "assign":
        assignee = str(args.get("assignee") or "").strip()
        if not assignee:
            raise ActionError("assign requires an 'assignee'")
        return ["assign", task_id, assignee]

    if verb in ("promote", "block", "unblock", "complete", "archive"):
        return [verb, task_id]

    raise ActionError(f"unknown or unsupported verb: {verb!r}")


def run_action(runner, instance, verb: str, task_id: Optional[str], args: dict[str, Any]):
    """Build the argv and run it via the instance's runner. Returns the RunResult.
    runner.run prepends `hermes -p <profile>`; we add the `kanban` subcommand here."""
    argv = verb_to_argv(verb, task_id, args)
    return runner.run(["kanban", *argv], timeout=20)


def read_board(runner, instance) -> list[dict]:
    """Full task list for the instance's default board, via `kanban list --json`."""
    r = runner.run(["kanban", "list", "--json"], timeout=12)
    return _parse_tasks(r.stdout if r.ok else "")


def read_assignees(runner, instance) -> list[str]:
    """Valid assignee profiles for the board, via `kanban assignees --json`. These are the
    profiles a task can be handed to — not just the instance's own connect-profile."""
    r = runner.run(["kanban", "assignees", "--json"], timeout=10)
    if not r.ok:
        return []
    try:
        data = json.loads(r.stdout or "[]")
    except Exception:
        return []
    return [
        str(a["name"])
        for a in (data if isinstance(data, list) else [])
        if isinstance(a, dict) and a.get("name") and a.get("on_disk", True)
    ]


def read_task(runner, instance, task_id: str) -> Optional[dict]:
    r = runner.run(["kanban", "show", task_id, "--json"], timeout=12)
    if not r.ok:
        return None
    try:
        d = json.loads(r.stdout or "null")
    except Exception:
        return None
    return d if isinstance(d, dict) else None


def _parse_tasks(text: str) -> list[dict]:
    try:
        d = json.loads(text or "[]")
    except Exception:
        return []
    tasks = d if isinstance(d, list) else (d.get("tasks") if isinstance(d, dict) else [])
    return [t for t in (tasks or []) if isinstance(t, dict)]
