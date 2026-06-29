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
self-host).

## Panels
- **Fleet** — per-instance gateway/dispatcher health, active profile, tasks in flight.
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

One command (creates `config.yaml`, a venv, installs deps, builds the UI):
```bash
./scripts/setup.sh        # Linux/macOS
.\scripts\setup.ps1       # Windows (PowerShell)
```
Then edit `config.yaml` to point at your instances and run:
```bash
.venv/bin/python -m uvicorn backend.app:create_app --factory --port 7700   # .venv\Scripts\python on Windows
# open http://localhost:7700
```

<details><summary>Manual setup (what the script does)</summary>

```bash
cp config.example.yaml config.yaml                      # 1. configure instances
python -m venv .venv                                    # 2. backend deps
.venv/Scripts/pip install -r backend/requirements.txt   #    (bin/pip on *nix)
cd frontend && npm install && npm run build && cd ..    # 3. build the UI
.venv/Scripts/python -m uvicorn backend.app:create_app --factory --port 7700   # 4. run
```
</details>

`config.yaml` lists each instance: a `local` transport runs `hermes` directly; an `ssh`
transport runs the same calls over an SSH key. See `config.example.yaml`.

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
- Frontend dev (hot reload, proxies `/api` to :7700): `cd frontend && npm run dev`
- Frontend tests: `cd frontend && npm run test`

## Architecture
FastAPI backend aggregates each instance via a `Runner` transport (local subprocess / SSH),
normalizes everything to one pydantic contract, and serves `GET /api/overview` plus the built
React (Vite + Tailwind) SPA. Collectors fail independently — an offline instance degrades to a
single card, never a broken page. A short TTL cache keeps polling from hammering SSH.

See `docs/DESIGN.md` and `docs/PLAN.md`.

## License
MIT.
