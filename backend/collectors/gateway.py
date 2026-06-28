from __future__ import annotations

from backend.models import GatewayStatus


def parse_gateway(text: str) -> GatewayStatus:
    """Parse `hermes gateway status` output (text varies by platform)."""
    low = text.lower()
    up = ("running" in low and "not running" not in low) or "is active" in low or "active (running)" in low
    lines = [raw.strip().lstrip("✓✗●•- \t") for raw in text.splitlines() if raw.strip()]
    # Prefer the most informative line: one mentioning running/pid/active.
    detail = ""
    for s in lines:
        if any(k in s.lower() for k in ("running", "pid", "active")):
            detail = s
            break
    if not detail:
        for s in lines:
            if "gateway" in s.lower():
                detail = s
                break
    return GatewayStatus(up=up, detail=detail[:140])


def collect_gateway(runner, instance) -> GatewayStatus:
    r = runner.run(["gateway", "status"])
    return parse_gateway((r.stdout or "") + "\n" + (r.stderr or ""))


def dispatcher_lock_path(instance) -> str:
    return instance.hermes_home.rstrip("/\\") + "/kanban/.dispatcher.lock"
