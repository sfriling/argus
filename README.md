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

## Panels (v1)
- **Fleet** — per-instance gateway/dispatcher health, active profile, tasks in flight.
- **Delegation** — kanban status counts + in-flight tasks per board.
- **Crons** — name · schedule · next run · last status.
- **Reliability Guard** — recent catches (inferred / rejected / loop-break) + today's tally.
- **Profiles** — the profiles per instance, active highlighted.

(Cost tracking and session history are planned for v1.1.)

## Requirements
- Python 3.11+ and Node 20+ (build the UI once).
- The `hermes` CLI reachable for each instance (locally, and/or over SSH for remotes).

## Setup
```bash
# 1. configure your instances
cp config.example.yaml config.yaml      # then edit paths / ssh targets

# 2. backend deps
python -m venv .venv && .venv/Scripts/pip install -r backend/requirements.txt   # (bin/pip on *nix)

# 3. build the UI
cd frontend && npm install && npm run build && cd ..

# 4. run
.venv/Scripts/python -m uvicorn backend.app:create_app --factory --port 7700
# open http://localhost:7700
```

`config.yaml` lists each instance: a `local` transport runs `hermes` directly; an `ssh`
transport runs the same calls over an SSH key. See `config.example.yaml`.

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
