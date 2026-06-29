from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from backend.aggregator import Aggregator
from backend import settings
from backend.settings import (
    AppConfig,
    actions_writable,
    config_writable,
    resolve_config_path,
    save,
    validate,
)
from backend import kanban_actions
from backend import session_detail
from backend.transport import make_runner


def _effective_bind_host(config: AppConfig) -> str:
    """The host the server is actually bound to. `argus serve` sets ARGUS_BIND_HOST
    so the write guard reflects a `--host` override, not just the file value."""
    return os.environ.get("ARGUS_BIND_HOST") or config.host


def create_app(config=None, aggregator=None) -> FastAPI:
    config = config or settings.load()
    agg = aggregator or Aggregator(config)
    bind_host = _effective_bind_host(config)
    app = FastAPI(title="Argus", description="Hermes fleet mission control (read-only)")

    @app.get("/api/overview")
    def overview():
        now_iso = datetime.now(timezone.utc).isoformat()
        return agg.get(now_iso)

    @app.get("/api/config")
    def get_config():
        cfg: AppConfig = agg.config
        return {
            "config": cfg.model_dump(exclude_none=True),
            "meta": {
                "path": str(resolve_config_path()),
                "writable": config_writable(cfg, bind_host),
                "localhost_bound": settings.is_localhost(bind_host),
                "writes_enabled": cfg.enable_config_writes,
            },
        }

    @app.put("/api/config")
    def put_config(body: dict):
        cfg: AppConfig = agg.config
        if not config_writable(cfg, bind_host):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Config writes are disabled. Set enable_config_writes: true and "
                    "bind Argus to localhost to edit settings from the UI."
                ),
            )
        try:
            new_cfg = validate(body)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        save(new_cfg)
        agg.replace_config(new_cfg)
        return {"ok": True, "config": new_cfg.model_dump(exclude_none=True)}

    def _instance_or_404(name: str):
        for inst in agg.config.instances:
            if inst.name == name:
                return inst
        raise HTTPException(status_code=404, detail=f"no instance named {name!r}")

    @app.get("/api/sessions/{instance}/{session_id}")
    def session_drilldown(instance: str, session_id: str):
        inst = _instance_or_404(instance)
        detail = session_detail.collect_session(make_runner(inst), inst, session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="session not found or not exportable")
        return detail

    @app.get("/api/kanban/{instance}/board")
    def kanban_board(instance: str):
        inst = _instance_or_404(instance)
        runner = make_runner(inst)
        tasks = kanban_actions.read_board(runner, inst)
        profiles = kanban_actions.read_assignees(runner, inst) or (
            [inst.profile] if inst.profile else []
        )
        return {
            "tasks": tasks,
            "meta": {
                "instance": instance,
                "writable": actions_writable(agg.config, bind_host),
                "actions_enabled": agg.config.enable_actions,
                "profiles": profiles,
            },
        }

    @app.get("/api/kanban/{instance}/task/{task_id}")
    def kanban_task(instance: str, task_id: str):
        inst = _instance_or_404(instance)
        task = kanban_actions.read_task(make_runner(inst), inst, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        return task

    @app.post("/api/kanban/{instance}/action")
    def kanban_action(instance: str, body: dict):
        inst = _instance_or_404(instance)
        if not actions_writable(agg.config, bind_host):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Actions are disabled. Set enable_actions: true and bind Argus to "
                    "localhost to act on the board."
                ),
            )
        verb = str(body.get("verb") or "")
        task_id = body.get("task_id")
        args = body.get("args") or {}
        try:
            r = kanban_actions.run_action(make_runner(inst), inst, verb, task_id, args)
        except kanban_actions.ActionError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if not r.ok:
            raise HTTPException(status_code=400, detail=(r.stderr or r.stdout or "action failed").strip()[:400])
        return {"ok": True, "stdout": (r.stdout or "").strip()}

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")

    return app
