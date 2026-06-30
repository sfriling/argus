"""In-process scheduler that fires READ-ONLY skill reviews on a per-instance cadence.

It calls the SAME `start_review` single-flight helper the manual endpoint uses (so a manual and a
scheduled run never overlap), and has no reference to the write-back engine — scheduling is
structurally read-only and gated only by enable_skill_review. `due_instances` is pure and
level-triggered (fires as soon as the slot is free, even if a tick slipped past the exact minute)."""
from __future__ import annotations

import os
import threading
from datetime import datetime, timedelta
from typing import Callable, Optional

TICK_SECONDS = 60


def due_instances(config, now: datetime, last_runs: dict[str, Optional[datetime]]) -> list[str]:
    """Names of instances whose schedule is due at `now` (all datetimes in the same naive tz).
    time-mode: due once per day at/after HH:MM. interval-mode: due every N hours since last run."""
    due: list[str] = []
    for inst in getattr(config, "instances", []):
        sc = getattr(inst, "schedule", None)
        if not sc or not sc.enabled:
            continue
        last = last_runs.get(inst.name)
        if sc.time:
            hh, mm = sc.time.split(":")
            today_at = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
            if now >= today_at and (last is None or last.date() < now.date()):
                due.append(inst.name)
        elif sc.interval_hours:
            if last is None or (now - last) >= timedelta(hours=sc.interval_hours):
                due.append(inst.name)
    return due


class ReviewScheduler(threading.Thread):
    def __init__(self, get_config: Callable[[], object], start_review: Callable[..., object],
                 get_last_runs: Callable[[], dict], stop_event: threading.Event, tick: int = TICK_SECONDS):
        super().__init__(daemon=True, name="argus-review-scheduler")
        self._get_config = get_config
        self._start_review = start_review            # (instance_name, inst, trigger) -> job | None (None = busy)
        self._get_last_runs = get_last_runs          # () -> {name: datetime|None} (local naive)
        self._stop_ev = stop_event                   # NOT self._stop — Thread uses that internally
        self._tick = tick

    def run(self) -> None:
        while not self._stop_ev.is_set():
            try:
                cfg = self._get_config()
                now = datetime.now()                 # local naive (schedule.time is local)
                last = self._get_last_runs()
                for name in due_instances(cfg, now, last):
                    inst = next((i for i in cfg.instances if i.name == name), None)
                    if inst is not None:
                        self._start_review(name, inst, "scheduled")   # None if a run is already in flight
            except Exception:
                pass                                  # one bad tick must never kill the daemon
            self._stop_ev.wait(self._tick)


def has_enabled_schedule(config) -> bool:
    return any(getattr(i, "schedule", None) and i.schedule.enabled for i in getattr(config, "instances", []))


def start_scheduler(get_config, start_review, get_last_runs, *, available: bool,
                    tick: int = TICK_SECONDS) -> tuple[Optional[ReviewScheduler], Optional[threading.Event]]:
    """Start the daemon only when reviews are available, a schedule is enabled, and the
    ARGUS_SCHEDULER env isn't 'off' (tests pass it off / configure no schedule)."""
    if os.environ.get("ARGUS_SCHEDULER", "").lower() == "off":
        return None, None
    cfg = get_config()
    if not available or not has_enabled_schedule(cfg):
        return None, None
    stop = threading.Event()
    sched = ReviewScheduler(get_config, start_review, get_last_runs, stop, tick=tick)
    sched.start()
    return sched, stop
