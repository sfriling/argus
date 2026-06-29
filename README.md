# Argus 👁️ — Hermes Fleet Mission Control

> The hundred-eyed guardian. A calm, single-pane, **read-only** overview of every
> [Hermes](https://github.com/NousResearch/hermes-agent) agent instance you run — local and
> remote — in one screen.

The stock Hermes dashboard is per-instance and detail-heavy, with no "is everything alive?"
home. Argus is **overview-first** and **cross-machine**: it watches all your instances at once
and foregrounds what matters — gateway/dispatcher health, kanban **delegation** in-flight,
crons, and (if you run one) the reliability-guard activity.

It does this without any agent-side install: it just runs the `hermes` CLI and reads state
files — locally and over SSH — and never changes anything (read-only by design, safe to
self-host). It can also surface your local **Claude Code** background agents in the same pane.

## Panels
- **Fleet** — per-instance gateway/dispatcher health, active profile, tasks in flight.
- **Claude Agents** — this desktop's Claude Code background agents (read from `~/.claude`):
  active ones pinned up top (name · current task · model · tokens · cwd · live state),
  recent/completed below. Hidden if you don't run Claude Code.
- **Delegation** — kanban status counts + in-flight tasks per board.
- **Crons** — name · schedule · next run · last status.
- **Reliability Guard** — recent catches (inferred / rejected / loop-break) + today's tally.
- **Usage** — sessions, tool calls, and token totals per instance over the last 7 days, with
  per-model token bars and top tools. (Tokens, not dollars — Hermes meters tokens, and most
  fleets mix subscriptions and credits.)
- **Recent Sessions** — the latest sessions per instance, cron runs flagged.
- **Profiles** — the profiles per instance, active highlighted.

## Requirements
- Python 3.11+ and Node 20+ (build the UI once).
- The `hermes` CLI reachable for each instance (locally, and/or over SSH for remotes).

## Setup

One command (venv, installs the `argus` command, builds the UI):
```bash
./scripts/setup.sh        # Linux/macOS
.\scripts\setup.ps1       # Windows (PowerShell)
```
Then create a config and run:
```bash
argus config init         # writes a starter config to the standard location
argus config path         # show where it lives, then edit it (or use `argus instance add`)
argus serve               # open http://localhost:7700
```

<details><summary>Manual setup (what the script does)</summary>

```bash
python -m venv .venv
.venv/Scripts/pip install -e .                          # installs deps + the `argus` command
cd frontend && npm install && npm run build && cd ..    # build the UI
.venv/Scripts/argus config init && .venv/Scripts/argus serve
```
</details>

## Configuration

Config is a single YAML file, managed three ways — pick whichever you like:

- **File** — edit it directly. Location precedence: `$ARGUS_CONFIG` → a repo-local
  `./config.yaml` (handy for dev) → the standard user dir
  (`%APPDATA%\Argus\config.yaml` on Windows, `~/.config/argus/config.yaml` elsewhere).
- **CLI** — `argus config init|path|show`, `argus instance add|remove|list`,
  `argus doctor` (validates config + probes each instance), `argus serve [--host --port --config]`.
- **Settings UI** — the gear in the header. Read-only by default; set
  `enable_config_writes: true` (and keep Argus bound to localhost) to add/edit instances
  and change port/refresh from the browser, with a confirm step before each write.

Each instance: a `local` transport runs `hermes` directly; an `ssh` transport runs the same
calls over an SSH key. See `config.example.yaml`.

### Run on login (optional)
`run-argus.cmd` launches Argus hidden and logs to `%LOCALAPPDATA%\argus.log`. To start it
automatically on Windows login, drop a one-line `.vbs` shim that calls it into your Startup
folder (`shell:startup`):
```vbs
CreateObject("WScript.Shell").Run """<repo>\run-argus.cmd""", 0, False
```
On Linux, run it under a systemd **user** service or your process manager of choice.

## Develop
- Backend tests: `.venv/Scripts/python -m pytest -q`
- Run the server: `argus serve` (or `.venv/Scripts/argus serve`)
- Frontend dev (hot reload, proxies `/api` to :7700): `cd frontend && npm run dev`
- Frontend tests: `cd frontend && npm run test`

## Architecture
FastAPI backend aggregates each instance via a `Runner` transport (local subprocess / SSH),
normalizes everything to one pydantic contract, and serves `GET /api/overview` plus the built
React (Vite + Tailwind) SPA. Collectors fail independently — an offline instance degrades to a
single card, never a broken page. A short TTL cache keeps polling from hammering SSH.

`backend/settings.py` is the config core (load/validate/locate/atomic-write); the CLI
(`backend/cli.py`) and the Settings UI both go through it. Config writes are exposed at
`PUT /api/config` only when `enable_config_writes` is set **and** the server is bound to
localhost — otherwise the dashboard stays fully read-only.

See `docs/DESIGN.md` and `docs/PLAN.md`.

## License
MIT.
