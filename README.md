# Argus 👁️ — Hermes Fleet Mission Control

> The hundred-eyed guardian. A calm, cross-machine dashboard for every
> [Hermes](https://github.com/NousResearch/hermes-agent) agent you run — and your local
> [Claude Code](https://claude.com/claude-code) agents — in one screen.

Argus answers, at a glance, across **every** instance at once: *is the fleet alive, what is it
doing right now, and does anything need me?*

The stock Hermes dashboard is per-instance and detail-heavy, with no "is everything OK?" home.
Argus is **overview-first** and **cross-machine**: it watches local **and** remote instances
together and foregrounds what matters — gateway/dispatcher health, kanban tasks, crons, token
usage, and reliability-guard activity.

It needs **no agent-side install**: it runs the `hermes` CLI and reads state files — locally and
over SSH — and is **read-only by default**. Optional, explicitly-gated write actions (edit config,
drive the kanban board) are localhost-only and confirm-gated.

> **Status:** works end to end; used daily against a local + a remote (SSH) Hermes. Backend and
> frontend are fully tested. No public release yet — contributions welcome.

---

## Contents
- [What you get](#what-you-get)
- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [The `argus` CLI](#the-argus-cli)
- [Write actions & security model](#write-actions--security-model)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Development](#development)
- [HTTP API](#http-api)
- [Running on login / deployment](#running-on-login--deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## What you get

A **Summary** landing page plus four tabs keep it calm:

| Tab | What's there |
|---|---|
| **Summary** | Attention strip (“all systems nominal” or what needs you) · per-instance health · **Live Now** (active Claude agents · kanban in-flight · next cron) · **Today** tiles (catches · loop-breaks · tokens · sessions). |
| **Board** | An interactive kanban board per instance, backed by the `hermes kanban` CLI: drag cards between valid columns, add tasks, comment, assign, archive. **Read-only unless `enable_actions`** is set (see [security](#write-actions--security-model)). |
| **Fleet** | Per-instance gateway/dispatcher health, active profile & profile list, and crons (name · schedule · next run · last status). |
| **Agents** | This machine’s **Claude Code** background agents (read from `~/.claude`): active ones pinned on top, recent below. Hidden if you don’t run Claude Code. |
| **Insights** | Usage over 7 days (sessions · tool calls · token totals · per-model bars · top tools — tokens, not dollars), recent sessions (**click one for a transcript drill-down**), and the **reliability-guard** tally.¹ |

¹ The reliability tally reads a custom `hermes-reliability-guard` plugin's trajectory log. If you
don't run that plugin, the panel shows a short "not installed" note instead — everything else
works without it.

Everything is fed by a single polled snapshot, so the whole board reflects one consistent moment.

---

## Requirements

- **Python 3.11+** and **Node 20+** (Node is only needed to build the UI once).
- The **`hermes` CLI** reachable for each instance you watch — locally, and/or over SSH for remotes.
- For SSH instances: key-based SSH access to the remote host.

Argus has been run on Windows and Linux. The remote transport assumes a POSIX remote.

---

## Quickstart

```bash
git clone <your-fork-url> argus && cd argus

# 1. install (venv + the `argus` command + build the UI)
./scripts/setup.sh        # Linux/macOS
.\scripts\setup.ps1       # Windows (PowerShell)

# 2. create a config and point it at your instance(s)
argus config init         # writes a starter config to the standard location
argus config path         # prints where it lives — open and edit it
argus doctor              # validate config + probe each instance

# 3. run
argus serve               # → http://localhost:7700
```

<details><summary>Manual setup (what the script does)</summary>

```bash
python -m venv .venv
.venv/Scripts/pip install -e .                          # deps + the `argus` command (bin/pip on *nix)
cd frontend && npm install && npm run build && cd ..    # build the SPA into frontend/dist
.venv/Scripts/argus config init
.venv/Scripts/argus serve
```
The server mounts the built `frontend/dist` at `/`, so one process serves both API and UI.
</details>

---

## Configuration

Argus reads a single YAML file. **You never have to hand-write it** (`argus config init` +
`argus instance add` cover it), but every key is documented in `config.example.yaml`.

### Where the config lives (precedence)

1. `$ARGUS_CONFIG` (explicit path), else
2. a repo-local `./config.yaml` if present (handy for development), else
3. the standard user dir:
   - Windows: `%APPDATA%\Argus\config.yaml`
   - Linux/macOS: `${XDG_CONFIG_HOME:-~/.config}/argus/config.yaml`

`argus config path` always prints the resolved location.

### Keys

| Key | Default | Meaning |
|---|---|---|
| `host` | `127.0.0.1` | Bind address. Keep on localhost if either write gate is enabled. |
| `port` | `7700` | HTTP port. |
| `refresh_seconds` | `5` | UI poll / backend cache TTL. |
| `claude_home` | `~/.claude` | Local Claude Code home for the Agents tab. `""` disables that tab. |
| `enable_config_writes` | `false` | Allow editing config from the Settings UI. See [security](#write-actions--security-model). |
| `enable_actions` | `false` | Allow Board write actions (create/move/comment/assign/archive). |
| `instances` | `[]` | The instances to watch (below). Empty is valid — add via the UI/CLI. |

### Instance fields

```yaml
instances:
  - name: local                       # display name (unique)
    transport: local                  # "local" (subprocess) | "ssh"
    profile: orchestrator             # Hermes profile to query as
    hermes_home: "~/.hermes"          # Hermes home dir on that machine
    hermes_bin: "hermes"              # path to the hermes binary (or just "hermes" if on PATH)

  - name: vps
    transport: ssh
    profile: orchestrator
    ssh: "user@your.vps.ip"           # ssh target (required for ssh transport)
    ssh_key: "~/.ssh/your_key"        # ssh private key (required for ssh transport)
    hermes_home: "/home/user/.hermes"
    hermes_bin: "/home/user/.hermes/hermes-agent/venv/bin/hermes"
    # reliability_log: "<path>"       # optional override; defaults to <hermes_home>/reliability/trajectories.jsonl
```

A `local` instance runs `hermes` as a subprocess and reads files directly. An `ssh` instance runs
the same calls over `ssh -i <key> <target>` and reads files via `cat`/`ls` — **read-only**, using
your existing key. Validation enforces that `ssh` instances declare both `ssh` and `ssh_key`.

---

## The `argus` CLI

Installed by `pip install -e .` (entry point in `pyproject.toml`).

```
argus serve [--host H --port P --config PATH]   Run the dashboard (flags override the config).
argus config init [--force]                     Write a starter config to the resolved location.
argus config path                               Print the resolved config path.
argus config show                               Print the loaded config as YAML.
argus instance add  --name N --transport local|ssh [--profile … --hermes-home … --hermes-bin …
                    --ssh user@host --ssh-key PATH]
argus instance remove --name N
argus instance list
argus doctor                                    Validate config; probe each instance’s reachability,
                                                hermes binary, and ssh key.
```

All commands resolve config the same way; `--config PATH` overrides discovery everywhere.

---

## Write actions & security model

**Argus is read-only by default.** It only *reads* via the `hermes` CLI and state files. Two
optional write surfaces exist, each behind an independent gate, and **both require the server to be
bound to localhost** — otherwise the write endpoints return `403`:

| Gate (config key) | Unlocks | Endpoint |
|---|---|---|
| `enable_config_writes` | The **Settings UI** (edit instances, port, refresh from the browser). | `PUT /api/config` |
| `enable_actions` | The **Board** actions (create/move/comment/assign/archive tasks). | `POST /api/kanban/{instance}/action` |

Design choices that keep this safe:

- **Opt-in, off by default** — a fresh clone can’t mutate anything.
- **Localhost-bound** — the guard checks the *actual* bound host (`argus serve` records it), so a
  `--host 0.0.0.0` override can’t silently open the write endpoints.
- **Confirm-gated UI** — destructive/irreversible actions (config save, task archive) require a
  confirm step.
- **Narrow surface** — the Board exposes only human verbs
  (`create/comment/assign/promote/block/unblock/complete/archive`). Agent-only verbs
  (`dispatch/decompose/swarm/claim`) are **not** exposed. Argus reimplements no task logic — Hermes
  owns the durable board; Argus just calls its CLI.

If you expose Argus beyond localhost, leave both gates `false`.

---

## How it works

```
            ┌──────────── browser (React SPA) ───────────┐
            │  polls GET /api/overview every Ns           │
            └───────────────────┬─────────────────────────┘
                                │
                      ┌─────────▼──────────┐
                      │  FastAPI (app.py)  │   one process serves API + built SPA
                      └─────────┬──────────┘
                                │
                    ┌───────────▼────────────┐
                    │ Aggregator (TTL cache)  │  fans out per instance, in threads
                    └───────────┬────────────┘
                                │  one Runner per instance
              ┌─────────────────┼──────────────────┐
        LocalRunner                            SshRunner
     (subprocess + file reads)        (ssh -i key … + cat/ls)
              │                                     │
        collectors/*  ── each shells out to `hermes …` / reads a state file ──
        gateway · profiles · kanban · crons · reliability · usage · sessions · claude_agents
```

- **One contract.** Collectors normalize everything into the pydantic models in `models.py`, served
  as `GET /api/overview`. The frontend polls it on `refresh_seconds`.
- **Independent failure.** Each collector is guarded — an offline instance or a flaky command
  degrades to a single card with an error, never a broken page.
- **TTL cache.** The `Aggregator` caches the snapshot for `refresh_seconds` so multiple browser tabs
  don’t hammer SSH.
- **Config core.** `settings.py` is the single source of truth for loading, validating, locating, and
  atomically writing config. The CLI and the Settings UI both go through it.

See `docs/DESIGN.md` for the full design and `docs/PLAN.md` for the build plan.

---

## Project layout

```
argus/
├── backend/
│   ├── app.py             create_app(): /api/overview, /api/config, /api/kanban/* routes + write guards
│   ├── settings.py        config core — pydantic models, discovery, load/validate/atomic-save, guards
│   ├── config.py          back-compat re-exports of settings
│   ├── cli.py             the `argus` command (serve / config / instance / doctor)
│   ├── aggregator.py      builds the Overview across instances (threaded) + TTL cache
│   ├── transport.py       LocalRunner (subprocess) and SshRunner (key-based, read-only)
│   ├── models.py          the pydantic API contract
│   ├── kanban_actions.py  board read + the verb→`hermes kanban` write mapper
│   └── collectors/        one module per data source (gateway, profiles, kanban, crons,
│                          reliability, usage, sessions, claude_agents)
├── frontend/src/
│   ├── App.tsx            header, tab bar, view switch, data hook
│   ├── nav/               Tabs
│   ├── summary/           SummaryView + the pure deriveAlerts() helper
│   ├── board/             the kanban Board tab (columns, drag rules, drawer, add)
│   ├── panels/            Fleet · Crons · Profiles · Usage · Sessions · Reliability · ClaudeAgents
│   ├── settings/          the Settings modal (read-only or editable)
│   └── ui/                shared Card primitive + status palette
├── scripts/               setup.sh / setup.ps1
├── docs/                  DESIGN.md, PLAN.md, superpowers/specs/*
├── config.example.yaml    every config key, documented
├── pyproject.toml         packaging + the `argus` entry point
└── run-argus.cmd          hidden Windows launcher (calls `argus serve`)
```

---

## Development

```bash
# Backend tests
.venv/Scripts/python -m pytest -q

# Frontend tests (Vitest + Testing Library)
cd frontend && npm run test

# Frontend dev server (hot reload; proxies /api → :7700, so run `argus serve` alongside)
cd frontend && npm run dev

# Production build of the SPA (also runs the TypeScript type-check)
cd frontend && npm run build
```

Conventions worth knowing if you extend it:

- **Adding a data source** = a new `backend/collectors/<thing>.py` with a pure `parse_*` (unit-tested
  with no I/O) plus a `collect_*` that calls `runner.run([...])` or `runner.read(path)`; add its field
  to `models.py` and wire it in `aggregator.py`. Keep collectors defensive — never raise into the
  aggregator.
- **Adding a panel** = a component under `frontend/src/panels/` (or a tab folder) reading the typed
  snapshot from `types.ts`; render it in the right tab in `App.tsx`.
- **CLI output is ASCII** — terminals on Windows (cp1252) choke on box-drawing/✓/✗, so `cli.py` sticks
  to ASCII.
- Both suites are expected to stay green; the frontend `build` includes the type-check.

---

## HTTP API

All JSON. Read endpoints are always available; write endpoints honor the gates above.

| Method & path | Purpose |
|---|---|
| `GET /api/overview` | The full fleet snapshot (every instance + Claude agents). |
| `GET /api/config` | Current config + meta (`{ path, writable, localhost_bound }`). |
| `PUT /api/config` | Save config. `403` unless `enable_config_writes` + localhost; `422` on invalid. |
| `GET /api/kanban/{instance}/board` | Tasks for that instance’s board + meta (`writable`, assignable `profiles`). |
| `GET /api/kanban/{instance}/task/{id}` | One task with comments/events. |
| `POST /api/kanban/{instance}/action` | `{ verb, task_id?, args }`. `403` unless `enable_actions` + localhost; `422` unknown verb. |

---

## Running on login / deployment

- **Windows:** `run-argus.cmd` launches Argus hidden (it derives its own path and runs `argus serve`,
  logging to `%LOCALAPPDATA%\argus.log`). To start it on login, drop a one-line `.vbs` shim into your
  Startup folder (`shell:startup`):
  ```vbs
  CreateObject("WScript.Shell").Run """<repo>\run-argus.cmd""", 0, False
  ```
- **Linux/macOS:** run `argus serve` under a `systemd --user` service, `launchd`, or any process
  manager.

Keep `host: 127.0.0.1` for a personal dashboard. If you put Argus behind a reverse proxy or expose it,
keep both write gates `false`.

---

## Troubleshooting

- **`argus config not found`** — run `argus config init` (or set `$ARGUS_CONFIG`). `argus config path`
  shows where it looks.
- **An instance shows as unreachable** — run `argus doctor`. For SSH, confirm the key path and that
  `ssh user@host hermes status` works from your shell.
- **Agents tab is empty** — you’re not running Claude Code on this machine, or `claude_home` is wrong;
  set it to `""` to hide the tab.
- **Settings/Board say “read-only”** — set `enable_config_writes` / `enable_actions` to `true` **and**
  keep `host: 127.0.0.1`, then restart.
- **Board: new task didn’t run** — that’s intended. New tasks are created *unassigned* and park in
  Ready without running; **assign** one to dispatch it.
- **Windows: extra terminal windows flash** — fixed; the launcher runs children with
  `CREATE_NO_WINDOW`. If you run `argus serve` from a console you won’t see them anyway.

---

## Contributing

Issues and PRs welcome. Please keep both test suites green (`pytest -q` and `npm run test`), add tests
for new collectors/panels, and keep the read-only-by-default posture intact — new write surfaces must
sit behind an explicit, localhost-gated flag.

## License

MIT — see [LICENSE](LICENSE).
