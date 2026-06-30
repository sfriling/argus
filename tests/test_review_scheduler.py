from datetime import datetime

from backend.config import AppConfig, Instance, ScheduleConfig
from backend.review_scheduler import due_instances, has_enabled_schedule, start_scheduler


def _cfg(**sched):
    sc = ScheduleConfig(**sched) if sched else None
    return AppConfig(instances=[Instance(name="local", transport="local", hermes_home="/h", schedule=sc)])


def test_due_time_mode_fires_at_or_after_hhmm_once_per_day():
    cfg = _cfg(enabled=True, time="09:00")
    before = datetime(2026, 6, 30, 8, 59)
    at = datetime(2026, 6, 30, 9, 0)
    after = datetime(2026, 6, 30, 9, 30)
    assert due_instances(cfg, before, {"local": None}) == []        # before the slot
    assert due_instances(cfg, at, {"local": None}) == ["local"]      # at the slot
    assert due_instances(cfg, after, {"local": None}) == ["local"]   # past the slot (level-triggered)
    # already ran today -> not due again
    assert due_instances(cfg, after, {"local": datetime(2026, 6, 30, 9, 1)}) == []
    # ran yesterday -> due
    assert due_instances(cfg, after, {"local": datetime(2026, 6, 29, 9, 1)}) == ["local"]


def test_due_interval_mode():
    cfg = _cfg(enabled=True, interval_hours=6)
    now = datetime(2026, 6, 30, 12, 0)
    assert due_instances(cfg, now, {"local": None}) == ["local"]                       # never ran
    assert due_instances(cfg, now, {"local": datetime(2026, 6, 30, 5, 59)}) == ["local"]  # >6h ago
    assert due_instances(cfg, now, {"local": datetime(2026, 6, 30, 7, 0)}) == []          # <6h ago


def test_disabled_or_no_schedule_never_due():
    assert due_instances(_cfg(), datetime(2026, 6, 30, 12, 0), {"local": None}) == []
    assert due_instances(_cfg(enabled=False, time="09:00"),
                         datetime(2026, 6, 30, 12, 0), {"local": None}) == []


def test_has_enabled_schedule():
    assert has_enabled_schedule(_cfg(enabled=True, time="09:00")) is True
    assert has_enabled_schedule(_cfg()) is False


def test_start_scheduler_guards(monkeypatch):
    monkeypatch.delenv("ARGUS_SCHEDULER", raising=False)
    calls = {"n": 0}
    cfg = _cfg(enabled=True, interval_hours=1)
    # not available -> no thread
    s, stop = start_scheduler(lambda: cfg, lambda *a: None, lambda: {}, available=False)
    assert s is None and stop is None
    # ARGUS_SCHEDULER=off -> no thread
    monkeypatch.setenv("ARGUS_SCHEDULER", "off")
    s, stop = start_scheduler(lambda: cfg, lambda *a: None, lambda: {}, available=True)
    assert s is None
    monkeypatch.delenv("ARGUS_SCHEDULER", raising=False)
    # available but NO schedule yet -> daemon still starts (idle), so a schedule enabled later
    # (e.g. via the Settings UI) is picked up live. Stop it.
    s, stop = start_scheduler(lambda: _cfg(), lambda *a: None, lambda: {}, available=True, tick=600)
    assert s is not None
    stop.set()
    s.join(timeout=2)
    # available + schedule + env ok -> starts; stop it immediately
    s, stop = start_scheduler(lambda: cfg, lambda *a: calls.__setitem__("n", calls["n"] + 1),
                              lambda: {"local": None}, available=True, tick=600)
    assert s is not None and s.is_alive()
    stop.set()
    s.join(timeout=2)
