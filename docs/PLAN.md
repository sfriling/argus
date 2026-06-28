# Argus Implementation Plan — Phase 1

> **For agentic workers:** implement task-by-task with TDD. Steps use `- [ ]`.

**Goal:** A read-only FastAPI+React web app that shows a unified overview of every Hermes instance (local + VPS): gateway/dispatcher health, kanban delegation, crons, reliability-guard activity, profiles.

**Architecture:** FastAPI backend aggregates each instance via a `Runner` transport (local subprocess / SSH), normalizes to a pydantic contract, serves `GET /api/overview` + the built SPA. React (Vite+TS+Tailwind) polls the endpoint and renders panels.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, pydantic v2, pytest; Vite, React 18, TypeScript, Tailwind, vitest.

## Global Constraints
- **Read-only.** No endpoint or collector may mutate Hermes state.
- Transports: `local` (subprocess + file read) and `ssh` (`ssh -i <key> <target> '<cmd>'`).
- A failed collector degrades ONE panel; a failed instance sets `reachable:false` — never break the whole response.
- Per-call timeout (default 8s); backend TTL cache = `refresh_seconds`.
- Bind localhost only; no auth in v1.
- Contract shape = `docs/DESIGN.md` "API contract" verbatim.

---

## Task 1: Backend scaffold + models (the contract)
**Files:** Create `backend/__init__.py`, `backend/models.py`, `backend/requirements.txt`, `tests/__init__.py`, `tests/test_models.py`

**Produces:** pydantic models used everywhere: `GatewayStatus`, `Dispatcher`, `KanbanTask`, `Kanban`, `Cron`, `ReliabilityEvent`, `ReliabilityToday`, `Reliability`, `InstanceOverview`, `Overview`.

- [ ] **Step 1** `requirements.txt`: `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pyyaml`, `pytest`, `httpx`.
- [ ] **Step 2** Write `backend/models.py` — every collector sub-object has a safe default so degradation is trivial:
```python
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field

class GatewayStatus(BaseModel):
    up: bool = False
    detail: str = ""

class Dispatcher(BaseModel):
    running: bool = False

class KanbanTask(BaseModel):
    id: str
    title: str = ""
    assignee: str = ""
    status: str = ""

class Kanban(BaseModel):
    counts: dict[str, int] = Field(default_factory=dict)
    in_flight: list[KanbanTask] = Field(default_factory=list)

class Cron(BaseModel):
    name: str = ""
    schedule: str = ""
    next_run: str = ""
    last_status: str = ""

class ReliabilityEvent(BaseModel):
    tool: str = ""
    field: str = ""
    action: str = ""
    attempt: int = 0

class ReliabilityToday(BaseModel):
    catches: int = 0
    loop_breaks: int = 0

class Reliability(BaseModel):
    today: ReliabilityToday = Field(default_factory=ReliabilityToday)
    recent: list[ReliabilityEvent] = Field(default_factory=list)

class PanelError(BaseModel):
    panel: str
    message: str

class InstanceOverview(BaseModel):
    name: str
    transport: Literal["local", "ssh"]
    reachable: bool = True
    error: Optional[str] = None
    gateway: GatewayStatus = Field(default_factory=GatewayStatus)
    dispatcher: Dispatcher = Field(default_factory=Dispatcher)
    active_profile: str = ""
    profiles: list[str] = Field(default_factory=list)
    kanban: Kanban = Field(default_factory=Kanban)
    crons: list[Cron] = Field(default_factory=list)
    reliability: Reliability = Field(default_factory=Reliability)
    panel_errors: list[PanelError] = Field(default_factory=list)

class Overview(BaseModel):
    generated_at: str = ""
    refresh_seconds: int = 5
    instances: list[InstanceOverview] = Field(default_factory=list)
```
- [ ] **Step 3** `tests/test_models.py`: assert `InstanceOverview(name="x", transport="local")` constructs with all sub-objects defaulting (e.g. `.kanban.counts == {}`, `.reliability.today.catches == 0`). Run `pytest -q`. Commit.

## Task 2: Config loader
**Files:** Create `backend/config.py`, `config.example.yaml`, `tests/test_config.py`
**Consumes:** none. **Produces:** `Instance` dataclass (`name, transport, profile, hermes_home, hermes_bin, ssh, ssh_key`) and `load_config(path)->AppConfig(refresh_seconds:int, instances:list[Instance])`.

- [ ] **Step 1** Write `config.example.yaml` mirroring DESIGN.md.
- [ ] **Step 2** Test: a tmp yaml with one local + one ssh instance loads into 2 `Instance`s, `refresh_seconds` default 5 when absent. Missing `instances` → `ValueError`.
- [ ] **Step 3** Implement `config.py` (pydantic model or dataclass + yaml.safe_load). Validate `transport in {local,ssh}`; ssh requires `ssh` + `ssh_key`. Run tests. Commit.

## Task 3: Transport (LocalRunner, SshRunner)
**Files:** Create `backend/transport.py`, `tests/test_transport.py`
**Produces:** `Runner` protocol: `run(args: list[str], timeout: int) -> RunResult(ok, stdout, stderr)`; `read(path: str, timeout: int) -> Optional[str]`; `exists(path: str, timeout: int) -> bool`. `LocalRunner(instance)`, `SshRunner(instance)`. `make_runner(instance) -> Runner`.

- [ ] **Step 1** Tests with a fake `subprocess.run` (monkeypatch): `LocalRunner.run(["x"])` invokes the configured `hermes_bin` for hermes subcommands; `SshRunner.run` builds `["ssh","-i",key,target,"<hermes_bin> a b"]`. `read` returns file text or None on failure; never raises.
- [ ] **Step 2** Implement. Key points: `run` for hermes calls prepends `hermes_bin` and `-p profile`; both runners catch all exceptions → `RunResult(ok=False,...)`. `SshRunner.read` = `ssh … 'cat <path>'`; `.exists` = `ssh … 'test -e <path> && echo 1'`. `LocalRunner.read`/`exists` use `pathlib`. Add `-o BatchMode=yes -o ConnectTimeout=<timeout>` to ssh.
- [ ] **Step 3** Run tests. Commit.

## Task 4: Collectors — gateway + profiles
**Files:** Create `backend/collectors/__init__.py`, `backend/collectors/gateway.py`, `backend/collectors/profiles.py`, `tests/test_collectors_gateway.py`, `tests/test_collectors_profiles.py`
**Consumes:** `Runner`, models. **Produces:** `collect_gateway(runner, instance)->(GatewayStatus, Dispatcher)`; `collect_profiles(runner, instance)->(active_profile:str, profiles:list[str])`.

- [ ] **Step 1** Gateway test fixtures (captured): up text contains `Gateway process running (PID: 27972)` or `✓ ... running`; down text contains `Gateway is not running`. Assert `up` parsed from each. Dispatcher: `runner.exists(home/'kanban/.dispatcher.lock')` → `running`.
- [ ] **Step 2** Profiles test: `runner.read(home/'active_profile')` → `"orchestrator\n"` → active=`orchestrator`; profiles = listing of `home/profiles/` (LocalRunner via fs; SshRunner via `ls`). Provide `runner.list_dir(path)`; add to transport in Task 3 if simpler (NOTE: add `list_dir` to Runner protocol here and back-fill Task 3 transport). For ssh: `ls -1 <path>`.
- [ ] **Step 3** Implement both; parse defensively (empty/None → safe defaults). Run tests. Commit.

## Task 5: Collector — kanban (JSON)
**Files:** Create `backend/collectors/kanban.py`, `tests/test_collectors_kanban.py`
**Produces:** `collect_kanban(runner, instance)->Kanban`. Calls `runner.run(["kanban","list","--json"])`; parses JSON array. Each task has `id,title,status,assignee` (assignee may be under `assignee`). `counts` = tally by `status`; `in_flight` = tasks with status in {ready,running,blocked} (cap 12, newest first if order given).

- [ ] **Step 1** Fixture = real JSON sample (array with status/assignee). Assert counts tally and in_flight excludes `done`/`archived`. Malformed JSON → empty `Kanban()` (no raise).
- [ ] **Step 2** Implement (json.loads in try/except). Run tests. Commit.

## Task 6: Collector — crons (text parse)
**Files:** Create `backend/collectors/crons.py`, `tests/test_collectors_crons.py`
**Produces:** `collect_crons(runner, instance)->list[Cron]`. Parses `hermes cron list` text blocks:
```
  c3cf946bef20 [active]
    Name:      Weekly Memory & Vault Audit
    Schedule:  0 9 * * 1
    Next run:  2026-06-29T09:00:00+00:00
    Last run:  2026-06-22T09:35:21  ok
```
- [ ] **Step 1** Fixture = captured multi-job text incl. "No scheduled jobs." → `[]`. Assert names/schedules/next/last parsed; `last_status` = trailing token of "Last run" line (`ok`/`error`) or "".
- [ ] **Step 2** Implement line-oriented parser keyed on `Name:`/`Schedule:`/`Next run:`/`Last run:`. Run tests. Commit.

## Task 7: Collector — reliability (jsonl)
**Files:** Create `backend/collectors/reliability.py`, `tests/test_collectors_reliability.py`
**Produces:** `collect_reliability(runner, instance)->Reliability`. Reads `home/reliability/trajectories.jsonl` (last ~200 lines), parses JSON per line. `recent` = last 10 (newest first) mapped to `ReliabilityEvent`. `today` = since the log has no timestamp, `catches` = count of all `action in {rejected,inferred}` in the tail; `loop_breaks` = count of events with `attempt>=2`. (Document this is tail-based, not calendar-day, in v1.)

- [ ] **Step 1** Fixture = sample jsonl (incl. the cron loop with attempt 1 & 2, a patch inferred). Assert `recent` length/order, `catches` and `loop_breaks` counts. Missing file → empty `Reliability()`.
- [ ] **Step 2** Implement. Run tests. Commit.

## Task 8: Aggregator (concurrent, degrade, cache)
**Files:** Create `backend/aggregator.py`, `tests/test_aggregator.py`
**Consumes:** all collectors, `make_runner`, models. **Produces:** `build_overview(config, now_iso)->Overview`; `Aggregator(config)` with TTL cache (`get(now_iso)`).

- [ ] **Step 1** Test with **fake runners** injected (a `runner_factory` param defaulting to `make_runner`): one healthy instance → populated `InstanceOverview`; one instance whose runner raises on every call → `reachable=False`, `error` set, other instance intact. Each collector wrapped so its exception → `panel_errors` entry + safe default, not a crash.
- [ ] **Step 2** Implement: per instance, build runner; run the 5 collectors inside individual `try/except` (append `PanelError` on failure); if the instance is wholly unreachable (a cheap probe — gateway collector failing with transport error), set `reachable=False`. Use `concurrent.futures.ThreadPoolExecutor` to run instances concurrently with per-call timeouts. TTL cache keyed on time.
- [ ] **Step 3** Run tests. Commit.

## Task 9: FastAPI app + static serving
**Files:** Create `backend/app.py`, `tests/test_app.py`
**Consumes:** `Aggregator`, `load_config`. **Produces:** `create_app(config)`; `GET /api/overview`→`Overview` JSON; mounts `frontend/dist` at `/` if it exists.

- [ ] **Step 1** Test with `httpx`/`TestClient` + a stubbed aggregator returning a known `Overview` → `GET /api/overview` 200, JSON matches; `refresh_seconds` present.
- [ ] **Step 2** Implement; `generated_at` stamped in the route (passed in, so tests stay deterministic via dependency override). Add `if (frontend/dist).exists(): app.mount("/", StaticFiles(directory=..., html=True))`. Run tests. Commit.

## Task 10: Frontend — scaffold + data hook + layout
**Files:** Create `frontend/` (Vite React-TS), `frontend/src/types.ts` (mirror contract), `frontend/src/useOverview.ts`, `frontend/src/App.tsx`, Tailwind config, `frontend/vite.config.ts` (proxy `/api`→`http://localhost:7700`).
- [ ] **Step 1** `npm create vite@latest frontend -- --template react-ts`; add Tailwind; `types.ts` mirrors `Overview`.
- [ ] **Step 2** `useOverview.ts`: poll `/api/overview` every `data.refresh_seconds` (default 5s); keep last-good on error + expose `stale:boolean`.
- [ ] **Step 3** `App.tsx`: dark calm layout (Tailwind), header with live/stale indicator + relative "updated Ns ago", responsive card grid hosting panels. Commit.

## Task 11: Frontend — the five panels
**Files:** Create `frontend/src/panels/FleetPanel.tsx`, `DelegationPanel.tsx`, `CronsPanel.tsx`, `ReliabilityPanel.tsx`, `ProfilesPanel.tsx`, `frontend/src/sample.ts` (contract fixture), `frontend/src/panels/__tests__/*` (vitest).
- [ ] **Step 1** Each panel: pure function of `Overview`/`InstanceOverview`. Fleet = per-instance health cards (gateway dot, dispatcher, active profile, in-flight count; offline → muted "degraded" card). Delegation = counts chips + in-flight list. Crons = table. Reliability = today tally + recent list (color by action: inferred=blue, rejected=amber, loop-break/attempt≥2=red). Profiles = chips, active highlighted.
- [ ] **Step 2** vitest: render each panel with `sample.ts` and an offline-instance sample; assert key text appears and offline degrades. Commit.

## Task 12: Integration + run + README
**Files:** Create `config.yaml` (local+VPS, gitignored), `README.md`, `Makefile`/`run.sh`.
- [ ] **Step 1** Real `config.yaml` for local + VPS (paths from DESIGN.md). Build frontend (`npm run build`) → `frontend/dist`.
- [ ] **Step 2** Run `uvicorn backend.app:create_app --factory --port 7700`; hit `http://localhost:7700/api/overview` and confirm BOTH instances populate with live data (gateway up, real kanban/crons/reliability). Fix any live-data parser gaps (real output may differ from fixtures — update parser + fixture).
- [ ] **Step 3** README: what it is, screenshot, `config.yaml` setup, run command, license. Commit.

## Self-Review (coverage)
- Contract (DESIGN API) → Task 1 models + Task 9 endpoint. ✓
- Transports local+ssh → Task 3. ✓
- 5 collectors → Tasks 4–7. ✓
- Degradation/concurrency/cache → Task 8. ✓
- 5 panels + hook + layout → Tasks 10–11. ✓
- Live both-instance verification → Task 12 Step 2. ✓
- Read-only: no collector/endpoint mutates (all `list`/`status`/`read`). ✓
- Type consistency: `collect_*` signatures + model names match across tasks and the contract. ✓
