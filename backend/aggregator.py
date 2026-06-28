from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

from backend.collectors.crons import collect_crons
from backend.collectors.gateway import collect_gateway, dispatcher_lock_path
from backend.collectors.kanban import collect_kanban
from backend.collectors.profiles import collect_profiles
from backend.collectors.reliability import collect_reliability
from backend.models import Dispatcher, InstanceOverview, Overview, PanelError
from backend.transport import make_runner


def build_instance(instance, runner_factory=make_runner) -> InstanceOverview:
    io = InstanceOverview(name=instance.name, transport=instance.transport)
    try:
        runner = runner_factory(instance)
    except Exception as e:
        io.reachable = False
        io.error = f"runner init failed: {e}"
        return io

    # Reachability probe independent of hermes exit codes: can we see hermes_home?
    # (ssh: fails if host down; local: fails if misconfigured.) Must not raise.
    try:
        reachable = (not instance.hermes_home) or runner.exists(instance.hermes_home)
    except Exception as e:
        io.reachable = False
        io.error = f"unreachable: {str(e)[:160]}"
        return io
    if not reachable:
        io.reachable = False
        io.error = "instance unreachable or hermes_home not found"
        return io

    def guard(panel, fn):
        try:
            return fn()
        except Exception as e:  # one panel failing must not break the instance
            io.panel_errors.append(PanelError(panel=panel, message=str(e)[:200]))
            return None

    gw = guard("gateway", lambda: collect_gateway(runner, instance))
    if gw is not None:
        io.gateway = gw
    io.dispatcher = Dispatcher(running=bool(guard("dispatcher", lambda: runner.exists(dispatcher_lock_path(instance)))))

    pr = guard("profiles", lambda: collect_profiles(runner, instance))
    if pr is not None:
        io.active_profile, io.profiles = pr
    kb = guard("kanban", lambda: collect_kanban(runner, instance))
    if kb is not None:
        io.kanban = kb
    cr = guard("crons", lambda: collect_crons(runner, instance))
    if cr is not None:
        io.crons = cr
    rl = guard("reliability", lambda: collect_reliability(runner, instance))
    if rl is not None:
        io.reliability = rl
    return io


def build_overview(config, now_iso: str, runner_factory=make_runner) -> Overview:
    instances = config.instances
    if not instances:
        return Overview(generated_at=now_iso, refresh_seconds=config.refresh_seconds, instances=[])
    with ThreadPoolExecutor(max_workers=max(2, len(instances))) as ex:
        results = list(ex.map(lambda inst: build_instance(inst, runner_factory), instances))
    return Overview(generated_at=now_iso, refresh_seconds=config.refresh_seconds, instances=results)


class Aggregator:
    """Caches the overview for `refresh_seconds` so frontend polling doesn't hammer SSH."""

    def __init__(self, config, runner_factory=make_runner):
        self.config = config
        self.runner_factory = runner_factory
        self._cache: Overview | None = None
        self._ts: float = 0.0

    def get(self, now_iso: str, now: float | None = None) -> Overview:
        t = now if now is not None else time.monotonic()
        if self._cache is not None and (t - self._ts) < self.config.refresh_seconds:
            return self._cache
        self._cache = build_overview(self.config, now_iso, self.runner_factory)
        self._ts = t
        return self._cache
