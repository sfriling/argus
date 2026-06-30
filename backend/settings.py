"""Argus configuration core — the single source of truth for loading, validating,
locating, and writing config. The CLI and the Settings UI both go through here."""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator


class ScheduleConfig(BaseModel):
    """Per-instance auto-review cadence. Read-only reviews only — never writes."""
    enabled: bool = False
    time: Optional[str] = None            # daily, local "HH:MM" (24h)
    interval_hours: Optional[int] = None  # or every N hours

    @model_validator(mode="after")
    def _exactly_one(self) -> "ScheduleConfig":
        if not self.enabled:
            return self
        has_time = bool(self.time)
        has_interval = self.interval_hours is not None
        if has_time == has_interval:
            raise ValueError("schedule: set exactly one of 'time' or 'interval_hours' when enabled")
        if has_time:
            import re
            if not re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", self.time or ""):
                raise ValueError("schedule.time must be 'HH:MM' (24h)")
        if has_interval and (self.interval_hours or 0) < 1:
            raise ValueError("schedule.interval_hours must be >= 1")
        return self


class Instance(BaseModel):
    name: str
    transport: str = "local"  # "local" | "ssh"
    profile: str = "default"  # Hermes's universal default profile; override per instance
    hermes_home: str = ""
    hermes_bin: str = "hermes"
    ssh: Optional[str] = None
    ssh_key: Optional[str] = None
    reliability_log: Optional[str] = None  # override; defaults to <hermes_home>/reliability/...
    schedule: Optional[ScheduleConfig] = None     # auto-review cadence (read-only)
    synced_skills: bool = False                   # skills tree kept in sync externally (Mutagen) → write once

    @field_validator("transport")
    @classmethod
    def _transport_valid(cls, v: str) -> str:
        if v not in ("local", "ssh"):
            raise ValueError("transport must be 'local' or 'ssh'")
        return v

    @model_validator(mode="after")
    def _ssh_needs_key(self) -> "Instance":
        if self.transport == "ssh" and (not self.ssh or not self.ssh_key):
            raise ValueError(f"instance {self.name!r}: ssh transport requires 'ssh' and 'ssh_key'")
        return self


class AppConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 7700
    refresh_seconds: int = 5
    claude_home: str = "~/.claude"      # local Claude Code home; "" disables that panel
    enable_config_writes: bool = False  # gate for the Settings-UI write endpoints
    enable_actions: bool = False        # gate for kanban (and future) write actions
    enable_skill_review: bool = False   # gate for the Claude-powered skill review (opt-in)
    enable_skill_writeback: bool = False  # gate for applying edits to SKILL.md files (default off)
    skill_review_model: str = "claude-opus-4-8"
    anthropic_api_key: str = ""         # prefer the ANTHROPIC_API_KEY env var over this
    claude_bin: str = "claude"          # Claude Code CLI — used (subscription auth) when no API key
    instances: list[Instance] = Field(default_factory=list)

    @property
    def claude_home_path(self) -> str:
        """Expanded local filesystem path for the Claude panel ("" when disabled)."""
        return os.path.expanduser(self.claude_home) if self.claude_home else ""


# --- config location ---------------------------------------------------------

def _standard_config_path() -> Path:
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "Argus" / "config.yaml"
    base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "argus" / "config.yaml"


def reviews_state_dir() -> Path:
    """Where the review ledger lives — beside the config file, under reviews/."""
    return _standard_config_path().parent / "reviews"


def resolve_config_path(explicit: Optional[str] = None) -> Path:
    """Precedence: explicit arg → $ARGUS_CONFIG → repo-local ./config.yaml → standard user dir."""
    if explicit:
        return Path(explicit)
    env = os.environ.get("ARGUS_CONFIG")
    if env:
        return Path(env)
    local = Path("config.yaml")
    if local.is_file():
        return local
    return _standard_config_path()


# --- load / save -------------------------------------------------------------

def load(path: Optional[str] = None) -> AppConfig:
    p = resolve_config_path(path)
    if not Path(p).is_file():
        raise FileNotFoundError(
            f"Argus config not found at {p}. Run `argus config init` to create one."
        )
    data = yaml.safe_load(Path(p).read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"config at {p} must be a YAML mapping")
    return validate(data)


def validate(data: dict) -> AppConfig:
    """Validate a raw dict into an AppConfig, surfacing errors as ValueError."""
    try:
        return AppConfig.model_validate(data)
    except ValidationError as e:
        raise ValueError(str(e)) from e


def to_yaml(config: AppConfig) -> str:
    """Serialize config to clean YAML with a header. Drops None fields so local
    instances don't carry empty ssh keys. Hand-comments are not round-tripped."""
    data = config.model_dump(exclude_none=True)
    body = yaml.safe_dump(data, sort_keys=False, default_flow_style=False, allow_unicode=True)
    return (
        "# Argus configuration — managed by `argus` CLI / Settings UI.\n"
        "# Hand-edits are fine, but comments are not preserved on UI/CLI writes.\n\n"
        + body
    )


def save(config: AppConfig, path: Optional[str] = None) -> Path:
    """Validate then atomically write config to `path` (or the resolved location)."""
    validate(config.model_dump())  # re-validate before persisting
    p = resolve_config_path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    text = to_yaml(config)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, p)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return p


def default_config() -> AppConfig:
    return AppConfig()


# --- write guard -------------------------------------------------------------

def is_localhost(host: str) -> bool:
    return host in ("127.0.0.1", "::1", "localhost", "")


def config_writable(config: AppConfig, bind_host: Optional[str] = None) -> bool:
    """Settings-UI writes are allowed only when explicitly enabled AND the server is
    bound to localhost. `bind_host` is the actual bound host (falls back to config.host)."""
    host = bind_host if bind_host is not None else config.host
    return bool(config.enable_config_writes) and is_localhost(host)


def actions_writable(config: AppConfig, bind_host: Optional[str] = None) -> bool:
    """Kanban (and future) write actions are allowed only when explicitly enabled AND the
    server is bound to localhost. Separate from config writes so they switch independently."""
    host = bind_host if bind_host is not None else config.host
    return bool(config.enable_actions) and is_localhost(host)


def anthropic_key(config: AppConfig) -> str:
    """The Anthropic API key — env var wins over the config field."""
    return os.environ.get("ANTHROPIC_API_KEY", "").strip() or (config.anthropic_api_key or "").strip()


def has_claude_cli(config: AppConfig) -> bool:
    """Whether the Claude Code CLI is on PATH (subscription-auth review path)."""
    return bool(shutil.which(config.claude_bin or "claude"))


def skill_review_available(config: AppConfig, bind_host: Optional[str] = None) -> bool:
    """The Claude skill review is available when enabled, bound to localhost, and Claude is
    reachable EITHER via an Anthropic API key OR the Claude Code CLI (subscription auth).
    Off → the feature is invisible and inert."""
    host = bind_host if bind_host is not None else config.host
    return (
        bool(config.enable_skill_review)
        and is_localhost(host)
        and (bool(anthropic_key(config)) or has_claude_cli(config))
    )


def skill_writeback_available(config: AppConfig, bind_host: Optional[str] = None) -> bool:
    """Write-back (applying edits to SKILL.md) requires enable_skill_writeback AND that the server
    is PROVABLY bound to localhost. Per R10 we do NOT trust config.host: writes require
    ARGUS_BIND_HOST to be set (which `argus serve` does) and to be a loopback address. A bare
    `uvicorn --host 0.0.0.0` (which never sets ARGUS_BIND_HOST) can therefore never write."""
    env_host = os.environ.get("ARGUS_BIND_HOST")
    if not env_host:
        return False
    host = bind_host if bind_host is not None else env_host
    return (
        bool(config.enable_skill_writeback)
        and is_localhost(host or "")
        and skill_review_available(config, host)
    )


# backward-compatible alias (older callers/tests import load_config)
def load_config(path: Optional[str] = "config.yaml") -> AppConfig:
    return load(path)
