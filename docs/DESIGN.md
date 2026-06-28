# Argus — Hermes Fleet Mission Control (Design Spec v1)

> The hundred-eyed all-seeing guardian. A calm, single-pane, **read-only** overview of
> every Hermes agent instance you run — local and remote — in one screen.

## Why
The stock Hermes dashboard is per-instance, detail-heavy, and has no "everything alive at a
glance" home. Argus is an **overview-first**, **cross-machine**, clean monitor that foregrounds
what now matters: gateway/dispatcher health, kanban **delegation** in-flight, crons, and the
custom **reliability guard** — across all instances at once.

Scope of v1 (Phase 1): **read-only**. No state-changing actions (safe to self-host / open-source).

## Architecture
A single **Python FastAPI** service (runs on the operator's box) that **aggregates** state from
N Hermes instances and serves a **React (Vite + TypeScript + Tailwind)** SPA.

Data is gathered the proven way (used reliably in production ops): the `hermes` CLI + reading
state files, over two **transports**:
- **local** — run `hermes …` + read files directly.
- **ssh** — the same commands/reads over SSH (key-based).

Instances are declared in `config.yaml`, which is what makes Argus generic:
```yaml
refresh_seconds: 5            # frontend poll + backend cache TTL
instances:
  - name: local
    transport: local
    profile: orchestrator      # profile used for hermes CLI calls
    hermes_home: "C:/Users/simon/AppData/Local/hermes"
    hermes_bin: "C:/Users/simon/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes"
  - name: vps
    transport: ssh
    profile: orchestrator
    ssh: "user@your.vps.ip"
    ssh_key: "~/.ssh/your_key"
    hermes_home: "/home/simon/.hermes"
    hermes_bin: "/home/simon/.hermes/hermes-agent/venv/bin/hermes"
```

## Data sources (per instance) — all verified
| Collector | Source | Command / path |
|---|---|---|
| gateway | text parse | `hermes -p <profile> gateway status` |
| dispatcher | file presence | `<hermes_home>/kanban/.dispatcher.lock` |
| profiles | filesystem | dirs in `<hermes_home>/profiles/` + `<hermes_home>/active_profile` |
| kanban | **JSON** | `hermes -p <profile> kanban list --json` |
| crons | text parse | `hermes -p <profile> cron list` |
| reliability | JSONL | tail of `<hermes_home>/reliability/trajectories.jsonl` |

`ssh` transport wraps each: `ssh -i <key> <ssh> '<cmd>'` and `ssh … 'cat <path>'`.

## Components (one job each)
```
backend/
  config.py        – load + validate config.yaml -> Instance[] (pydantic)
  transport.py     – Runner protocol; LocalRunner, SshRunner: run(cmd)->text, read(path)->text|None
  collectors/
    gateway.py     – parse `gateway status` + lock file -> GatewayStatus
    profiles.py    – list profiles + active -> Profiles
    kanban.py      – parse kanban JSON -> Kanban{counts, in_flight[]}
    crons.py       – parse `cron list` -> Cron[]
    reliability.py – tail/parse trajectories.jsonl -> Reliability{today, recent[]}
  aggregator.py    – run all collectors × all instances concurrently, per-call timeout, TTL cache
  models.py        – pydantic schemas (the collector -> API -> frontend contract)
  app.py           – FastAPI: GET /api/overview (JSON) + serve built SPA at /
frontend/ (Vite + React + TS + Tailwind)
  src/useOverview.ts   – polls /api/overview every refresh_seconds
  src/panels/          – FleetPanel · DelegationPanel · CronsPanel · ReliabilityPanel · ProfilesPanel
  src/App.tsx          – layout (dark, card grid, calm)
config.example.yaml · README.md · LICENSE (MIT)
```

## API contract — `GET /api/overview`
```jsonc
{
  "generated_at": "<iso8601>",          // stamped by caller, not in tests
  "refresh_seconds": 5,
  "instances": [
    {
      "name": "local",
      "transport": "local",
      "reachable": true,                 // false => degraded card, other fields best-effort/null
      "error": null,                     // string if the whole instance failed
      "gateway": { "up": true, "detail": "running (pid 27972)" },
      "dispatcher": { "running": true }, // lock-file present
      "active_profile": "orchestrator",
      "profiles": ["orchestrator","executor","planner","researcher"],
      "kanban": {
        "counts": { "ready": 1, "running": 1, "blocked": 0, "done": 4 },
        "in_flight": [ { "id": "t_573a", "title": "...", "assignee": "researcher", "status": "running" } ]
      },
      "crons": [ { "name": "Vault Health Check", "schedule": "0 9 * * 4", "next_run": "...", "last_status": "ok" } ],
      "reliability": {
        "today": { "catches": 3, "loop_breaks": 1 },
        "recent": [ { "tool": "cronjob", "field": "schedule", "action": "rejected", "attempt": 2, "ts": null } ]
      }
    }
  ]
}
```
Each collector returns its sub-object; the aggregator assembles per-instance; a failed collector
sets that sub-object to a safe empty/degraded shape and records a per-panel error — it never
breaks the whole response.

## Panels (v1)
1. **Fleet** (hero) — per-instance card: gateway up/down, dispatcher on/off, active profile, tasks-in-flight count.
2. **Delegation** — kanban status counts + in-flight task list, per instance.
3. **Crons** — name · schedule · next run · last status, per instance.
4. **Reliability Guard** — recent catches (inferred/rejected/loop-break) + today's tally.
5. **Profiles** — the profiles, active highlighted.
(Cost → v1.1. Sessions → v1.1.)

## Resilience & errors
- Collectors run concurrently per instance with a per-call timeout (e.g. 8s).
- Unreachable instance (ssh/cmd fails) → `reachable:false`, panels degrade gracefully; the rest of the fleet still renders.
- Backend TTL cache (`refresh_seconds`) so the frontend poll doesn't hammer SSH.
- Frontend: if `/api/overview` fails, keep last-good data + show a "stale" indicator.

## Testing
- **Collectors**: unit tests against **captured real output** fixtures (`kanban list --json`, `cron list`, `gateway status`, `trajectories.jsonl`). Parser correctness incl. malformed/empty.
- **Aggregator**: fake runners incl. one that raises (offline instance) → asserts degraded shape, others intact.
- **API**: `/api/overview` smoke test with a stubbed aggregator.
- **Frontend**: light component tests for each panel against sample JSON; optional Playwright smoke.

## Run / deploy
- Dev: `vite` dev server + `uvicorn backend.app:app --reload`.
- Prod/self-host: build SPA → served by FastAPI; `uvicorn backend.app:app --port 7700`. One command, read-only.

## Non-goals (v1)
No control actions, no auth (bind localhost), no cost, no historical storage/DB (live snapshot only).
