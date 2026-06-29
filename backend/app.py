from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from backend.aggregator import Aggregator
from backend import settings
from backend.settings import AppConfig, config_writable, resolve_config_path, save, validate


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

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")

    return app
