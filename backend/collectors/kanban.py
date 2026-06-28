from __future__ import annotations

import json

from backend.models import Kanban, KanbanTask

_DONE = {"done", "archived", "complete", "completed", "cancelled", "canceled"}


def collect_kanban(runner, instance) -> Kanban:
    r = runner.run(["kanban", "list", "--json"])
    if not r.ok or not (r.stdout or "").strip():
        return Kanban()
    try:
        data = json.loads(r.stdout)
    except Exception:
        return Kanban()
    if not isinstance(data, list):
        return Kanban()

    counts: dict[str, int] = {}
    in_flight: list[KanbanTask] = []
    for t in data:
        if not isinstance(t, dict):
            continue
        status = str(t.get("status") or t.get("state") or "").lower()
        if status:
            counts[status] = counts.get(status, 0) + 1
        if status and status not in _DONE:
            in_flight.append(
                KanbanTask(
                    id=str(t.get("id") or ""),
                    title=str(t.get("title") or "")[:100],
                    assignee=str(t.get("assignee") or t.get("owner") or ""),
                    status=status,
                )
            )
    return Kanban(counts=counts, in_flight=in_flight[:12])
