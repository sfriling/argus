from __future__ import annotations

from backend.models import Cron


def collect_crons(runner, instance) -> list[Cron]:
    r = runner.run(["cron", "list"])
    return parse_crons(r.stdout or "")


def parse_crons(text: str) -> list[Cron]:
    if "no scheduled jobs" in text.lower():
        return []
    crons: list[Cron] = []
    cur: Cron | None = None

    def flush():
        nonlocal cur
        if cur is not None and (cur.name or cur.schedule):
            crons.append(cur)
        cur = None

    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("Name:"):
            flush()
            cur = Cron(name=line.split(":", 1)[1].strip())
        elif cur is not None and line.startswith("Schedule:"):
            cur.schedule = line.split(":", 1)[1].strip()
        elif cur is not None and line.startswith("Next run:"):
            cur.next_run = line.split(":", 1)[1].strip()
        elif cur is not None and line.startswith("Last run:"):
            val = line.split(":", 1)[1].strip()
            cur.last_status = val.split()[-1] if val else ""
    flush()
    return crons
