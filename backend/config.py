from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml


@dataclass
class Instance:
    name: str
    transport: str  # "local" | "ssh"
    profile: str = "orchestrator"
    hermes_home: str = ""
    hermes_bin: str = "hermes"
    ssh: Optional[str] = None
    ssh_key: Optional[str] = None
    reliability_log: Optional[str] = None  # override; defaults to <hermes_home>/reliability/trajectories.jsonl


@dataclass
class AppConfig:
    refresh_seconds: int = 5
    instances: list[Instance] = field(default_factory=list)
    claude_home: str = ""  # local ~/.claude for the Claude Agents panel; "" disables it


def load_config(path: str = "config.yaml") -> AppConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    raw_instances = data.get("instances")
    if not raw_instances or not isinstance(raw_instances, list):
        raise ValueError("config must define a non-empty 'instances' list")

    instances: list[Instance] = []
    for item in raw_instances:
        transport = item.get("transport", "local")
        if transport not in ("local", "ssh"):
            raise ValueError(f"instance {item.get('name')!r}: transport must be 'local' or 'ssh'")
        if transport == "ssh" and (not item.get("ssh") or not item.get("ssh_key")):
            raise ValueError(f"instance {item.get('name')!r}: ssh transport requires 'ssh' and 'ssh_key'")
        instances.append(
            Instance(
                name=item["name"],
                transport=transport,
                profile=item.get("profile", "orchestrator"),
                hermes_home=item.get("hermes_home", ""),
                hermes_bin=item.get("hermes_bin", "hermes"),
                ssh=item.get("ssh"),
                ssh_key=item.get("ssh_key"),
                reliability_log=item.get("reliability_log"),
            )
        )

    raw_claude_home = data.get("claude_home", "~/.claude")
    claude_home = os.path.expanduser(raw_claude_home) if raw_claude_home else ""

    return AppConfig(
        refresh_seconds=int(data.get("refresh_seconds", 5)),
        instances=instances,
        claude_home=claude_home,
    )
