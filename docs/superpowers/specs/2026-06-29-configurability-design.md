---
title: Argus — Full Configurability (file · CLI · editable UI)
date: 2026-06-29
status: approved
tags: [argus, config, cli, open-source, design]
---

# Argus — Full Configurability

## Goal
Make Argus fully configurable for open-sourcing: no hardcoded file locations or
ports anywhere. Configuration is managed through three surfaces sharing one core —
a config **file** (standard location, great defaults), a **CLI**, and an **editable
Settings UI** (opt-in, localhost-only, confirm-gated).

## Scope decisions (from brainstorming)
- **Surfaces:** CLI + editable Settings UI, on top of a clean config file.
- **Config location:** standard user dir by default, with `$ARGUS_CONFIG` and a
  repo-local `config.yaml` dev override.
- **Write safety:** write endpoints disabled unless `enable_config_writes: true`;
  when enabled, the server must be localhost-bound (refuses otherwise) + UI confirm.

## Current state (from audit)
Backend is already mostly config-driven (instances, hermes_home, claude_home,
ssh_key, refresh_seconds). Genuinely hardcoded: `run-argus.cmd` (absolute repo path,
venv, host, port, log path), host/port (only on the uvicorn command line), and the
config path (`load_config("config.yaml")`, cwd-relative). Path *conventions*
(`reliability/trajectories.jsonl`, `kanban/.dispatcher.lock`) derive from the
configurable `hermes_home` and are fine. Frontend already uses a relative
`/api/overview`.

## 1 · Config core — `backend/settings.py`
- Migrate config from dataclasses to **pydantic models** (validation + YAML/JSON
  serialization both new surfaces need). `Instance` and `AppConfig` become
  `pydantic.BaseModel`.
- **New configurable fields** on `AppConfig`: `host` (default `127.0.0.1`),
  `port` (`7700`), `log_file` (default platform log path), `enable_config_writes`
  (default `false`) — alongside existing `refresh_seconds`, `claude_home`,
  `instances`.
- **Discovery precedence** (`resolve_config_path`):
  1. `$ARGUS_CONFIG` if set
  2. repo-local `./config.yaml` if present (dev convenience)
  3. standard user dir: `%APPDATA%\Argus\config.yaml` (Windows) /
     `${XDG_CONFIG_HOME:-~/.config}/argus/config.yaml` (*nix)
- **API:** `resolve_config_path()`, `load(path=None)`, `save(config, path)`
  (atomic write via temp-file + replace, validates first), `default_config()`.
- **Write format:** regenerate clean YAML with a header comment. Hand-edited
  comments are not round-tripped (documented) — avoids a ruamel.yaml dependency.
- `load()` raises a clear error on malformed/invalid config; callers surface it.

## 2 · CLI — `backend/cli.py` (entry point `argus`)
- Packaged via a minimal `pyproject.toml` (`console_scripts: argus = backend.cli:main`);
  `setup.{sh,ps1}` switch to `pip install -e .`.
- Subcommands:
  - `argus serve [--host --port --config]` — resolve config, run uvicorn
    programmatically (flags override file values).
  - `argus config init [--force]` — write a starter config to the resolved standard
    path; refuse to clobber unless `--force`.
  - `argus config path` — print the resolved config path.
  - `argus config show` — print the loaded config as YAML.
  - `argus instance add|remove|list` — mutate `instances` (add takes
    name/transport/profile/hermes_home/hermes_bin/ssh/ssh_key flags).
  - `argus doctor` — validate config; per instance check hermes bin presence, ssh key
    file, and reachability; report a tidy pass/fail table.
- All subcommands operate through `settings.py` (no parallel logic).

## 3 · Editable Settings UI + write guard
- **Backend endpoints:**
  - `GET /api/config` → `{ config, meta: { path, writable, localhost_bound } }`.
    `writable = enable_config_writes AND localhost_bound`.
  - `PUT /api/config` → validates body, `save()`s, triggers aggregator reload.
    Returns **403** when `enable_config_writes` is false OR the server is not
    localhost-bound. Returns **422** on invalid config.
  - Guard helper `config_writable(config, host)` — single source for the rule;
    unit-tested for every branch.
- **Aggregator reload:** `Aggregator.replace_config(new_config)` swaps config and
  clears the cache so the next poll reflects changes. `app.py` wires the PUT handler
  to call it.
- **Frontend Settings view:** opened from a header gear icon. Shows config path +
  writable state. When writable: an instance editor (add/edit/remove rows; fields for
  port, refresh, claude_home) with a **confirm** step before PUT. When not writable:
  read-only display of the current config plus the file path and a one-liner on
  enabling writes (`enable_config_writes: true` + localhost). This delivers the
  read-only view for free.

## 4 · Launcher, packaging, tests
- `run-argus.cmd`: `cd /d "%~dp0"` (derive own location) then `argus serve`
  (host/port/log come from config). Autostart `.vbs` unchanged (still calls the cmd).
- `setup.{sh,ps1}`: `pip install -e .`, then print `argus serve` / `argus config init`.
- `config.example.yaml`: add `host`/`port`/`enable_config_writes` with comments.
- **Tests:**
  - settings: discovery precedence, load/validate errors, save round-trip + atomicity.
  - guard: `config_writable` truth table; `PUT /api/config` 403 (disabled), 403
    (non-localhost), 422 (invalid), 200 (happy path with reload).
  - CLI: `config init/path/show`, `instance add/remove/list`, `doctor` on a temp config.
  - frontend: Settings view renders read-only vs editable; confirm gating.
  - Both suites stay green.

## Build order
1. Config core (settings.py + pydantic migration) — update existing callers/tests.
2. CLI + pyproject + setup scripts + launcher.
3. Write endpoints + guard + aggregator reload.
4. Settings UI.
5. Configure Simon's setup (separate step): migrate his current `config.yaml` to the
   standard location, set host/port, decide on `enable_config_writes`.

## Out of scope (YAGNI)
- Comment-preserving YAML round-trip (ruamel).
- Auth/token for writes (localhost + opt-in is the chosen posture).
- Hot-reload of host/port (changing those needs a restart; documented).
- Multi-user/RBAC.
