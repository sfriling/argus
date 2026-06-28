from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.aggregator import Aggregator
from backend.config import load_config


def create_app(config=None, aggregator=None) -> FastAPI:
    config = config or load_config()
    agg = aggregator or Aggregator(config)
    app = FastAPI(title="Argus", description="Hermes fleet mission control (read-only)")

    @app.get("/api/overview")
    def overview():
        now_iso = datetime.now(timezone.utc).isoformat()
        return agg.get(now_iso)

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")

    return app
