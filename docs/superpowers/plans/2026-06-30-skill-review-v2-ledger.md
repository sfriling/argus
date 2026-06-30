# Skill Review V2 — Ledger Subsystem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every skill-review run (report + per-gap apply-outcome slots) to a JSON-per-run ledger that survives restarts, and expose it over the API — the foundation for V2 scheduling and write-back.

**Architecture:** A new pure-I/O module `backend/review_ledger.py` writes `<state_dir>/reviews/<instance>/<run_id>.json` (full record) plus a lightweight `index.json`, all via atomic `tempfile`+`os.replace`, files `0600`/dirs `0700`. `_do_review` in `app.py` persists each completed report; two GET endpoints serve history. Reuses the atomic-write idiom already in `settings.save`.

**Tech Stack:** Python stdlib (`json`, `tempfile`, `os`, `threading`, `pathlib`, `datetime`), pydantic models, FastAPI.

## Global Constraints

- No new dependencies (stdlib + existing pydantic/FastAPI only).
- All writes atomic: write a temp file in the same dir, then `os.replace`.
- Ledger dir mode `0700`, files `0600` (R12 — may contain memory-derived text).
- A module-level lock serializes `index.json` read-modify-write — its OWN lock, never the review `review_lock` (R11 deadlock guard).
- Times: `run_id` is a UTC compact stamp `YYYYMMDDTHHMMSSZ`. Scripts must not call `datetime.now()` where a passed-in `now` is available (testability).
- State dir: `reviews_state_dir()` = the Argus config dir parent / `reviews` (`%APPDATA%/Argus/reviews` on Windows; `$XDG_CONFIG_HOME/argus/reviews` or `~/.config/argus/reviews` on POSIX), mirroring `settings._standard_config_path()`.

---

## Task 1: Models + state-dir helper

**Files:**
- Modify: `backend/models.py` (add ledger models; extend `ReviewReport`)
- Modify: `backend/settings.py` (add `reviews_state_dir`)
- Test: `tests/test_review_ledger.py` (new)

**Interfaces:**
- Produces: `ApplyOutcome{gap_index:int, status:str, path:str='', backup_path:str='', new_sha256:str='', applied_at:str='', error:str=''}`; `GapRecord{gap:SkillGap, outcome:ApplyOutcome|None=None}`; `LedgerIndexEntry{run_id, instance, started_at, finished_at, status, model, trigger, gap_count:int, applied_count:int}`; `LedgerRecord{report:ReviewReport, gaps:list[GapRecord], trigger:str, created_at:str}`; `ReviewReport` gains `run_id:str=''` and `trigger:str='manual'`. `settings.reviews_state_dir() -> Path`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_review_ledger.py
from backend.models import LedgerRecord, LedgerIndexEntry, GapRecord, ApplyOutcome, ReviewReport, SkillGap


def test_ledger_models_roundtrip():
    rec = LedgerRecord(
        report=ReviewReport(summary="s", instance="local", run_id="20260630T120000Z", trigger="manual"),
        gaps=[GapRecord(gap=SkillGap(title="g"), outcome=None)],
        trigger="manual", created_at="2026-06-30T12:00:00Z",
    )
    d = rec.model_dump()
    back = LedgerRecord(**d)
    assert back.report.run_id == "20260630T120000Z"
    assert back.gaps[0].gap.title == "g"
    assert back.gaps[0].outcome is None
    o = ApplyOutcome(gap_index=0, status="applied", backup_path="b")
    assert o.status == "applied"
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /d/Projects/ScratchPad/argus && .venv/Scripts/python -m pytest tests/test_review_ledger.py::test_ledger_models_roundtrip -q`
Expected: FAIL (ImportError: cannot import name 'LedgerRecord').

- [ ] **Step 3: Add the models**

In `backend/models.py`, after the existing `ReviewReport`/`DriftItem` block, add:

```python
class ApplyOutcome(BaseModel):
    gap_index: int
    status: str                       # "applied" | "skipped" | "conflict" | "failed"
    path: str = ""
    backup_path: str = ""
    new_sha256: str = ""
    applied_at: str = ""
    error: str = ""


class GapRecord(BaseModel):
    gap: SkillGap
    outcome: ApplyOutcome | None = None


class LedgerIndexEntry(BaseModel):
    run_id: str
    instance: str
    started_at: str = ""
    finished_at: str = ""
    status: str = ""                  # "done" | "error"
    model: str = ""
    trigger: str = "manual"           # "manual" | "scheduled"
    gap_count: int = 0
    applied_count: int = 0


class LedgerRecord(BaseModel):
    report: ReviewReport
    gaps: list[GapRecord] = Field(default_factory=list)
    trigger: str = "manual"
    created_at: str = ""
```

And extend `ReviewReport` (add two fields to the existing class):

```python
    run_id: str = ""
    trigger: str = "manual"
```

- [ ] **Step 4: Add `reviews_state_dir` to settings.py**

Find `_standard_config_path()` in `backend/settings.py`. Add below it:

```python
def reviews_state_dir() -> Path:
    """Where the review ledger lives — beside the config file, under reviews/."""
    return _standard_config_path().parent / "reviews"
```

(If `Path` isn't imported in settings.py, it already is — `_standard_config_path` returns one.)

- [ ] **Step 5: Run the test, verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_review_ledger.py::test_ledger_models_roundtrip -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/settings.py tests/test_review_ledger.py
git commit -m "Add review-ledger models and reviews_state_dir"
```

---

## Task 2: Ledger core — write_run / read_run / list_runs

**Files:**
- Create: `backend/review_ledger.py`
- Test: `tests/test_review_ledger.py`

**Interfaces:**
- Consumes: `models.LedgerRecord/LedgerIndexEntry/ApplyOutcome`, `settings.reviews_state_dir`.
- Produces: `new_run_id(now: datetime) -> str`; `write_run(rec: LedgerRecord, *, root: Path|None=None) -> str` (returns run_id, writes `<root>/<instance>/<run_id>.json` + upserts `index.json`); `read_run(instance, run_id, *, root=None) -> LedgerRecord|None`; `list_runs(instance, limit=50, *, root=None) -> list[LedgerIndexEntry]`. `root` defaults to `reviews_state_dir()` (injectable for tests).

- [ ] **Step 1: Write the failing test**

```python
from datetime import datetime, timezone
from backend import review_ledger as L
from backend.models import LedgerRecord, ReviewReport, GapRecord, SkillGap

NOW = datetime(2026, 6, 30, 12, 0, 0, tzinfo=timezone.utc)


def _rec(instance="local", run_id="20260630T120000Z"):
    return LedgerRecord(
        report=ReviewReport(summary="s", instance=instance, model="m", run_id=run_id, trigger="manual"),
        gaps=[GapRecord(gap=SkillGap(title="g1")), GapRecord(gap=SkillGap(title="g2"))],
        trigger="manual", created_at="2026-06-30T12:00:00Z",
    )


def test_write_read_list_roundtrip(tmp_path):
    rid = L.write_run(_rec(), root=tmp_path)
    assert rid == "20260630T120000Z"
    got = L.read_run("local", rid, root=tmp_path)
    assert got is not None and got.report.summary == "s" and len(got.gaps) == 2
    idx = L.list_runs("local", root=tmp_path)
    assert len(idx) == 1 and idx[0].run_id == rid and idx[0].gap_count == 2


def test_new_run_id_format():
    assert L.new_run_id(NOW) == "20260630T120000Z"


def test_list_runs_newest_first_and_missing_instance(tmp_path):
    L.write_run(_rec(run_id="20260630T120000Z"), root=tmp_path)
    L.write_run(_rec(run_id="20260630T130000Z"), root=tmp_path)
    ids = [e.run_id for e in L.list_runs("local", root=tmp_path)]
    assert ids == ["20260630T130000Z", "20260630T120000Z"]   # newest first
    assert L.list_runs("nobody", root=tmp_path) == []
```

- [ ] **Step 2: Run it, verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_review_ledger.py -q`
Expected: FAIL (ModuleNotFoundError: backend.review_ledger).

- [ ] **Step 3: Implement the core**

```python
# backend/review_ledger.py
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime
from pathlib import Path

from backend.models import ApplyOutcome, LedgerIndexEntry, LedgerRecord
from backend.settings import reviews_state_dir

_INDEX_LOCK = threading.Lock()


def new_run_id(now: datetime) -> str:
    return now.strftime("%Y%m%dT%H%M%SZ")


def _root(root: Path | None) -> Path:
    return root if root is not None else reviews_state_dir()


def _instance_dir(root: Path | None, instance: str) -> Path:
    d = _root(root) / instance
    d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(_root(root), 0o700)
        os.chmod(d, 0o700)
    except OSError:
        pass            # best-effort on platforms without POSIX perms
    return d


def _atomic_write_json(path: Path, obj) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _index_path(root: Path | None, instance: str) -> Path:
    return _instance_dir(root, instance) / "index.json"


def _read_index(root: Path | None, instance: str) -> list[LedgerIndexEntry]:
    p = _index_path(root, instance)
    try:
        rows = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for r in rows if isinstance(rows, list) else []:
        try:
            out.append(LedgerIndexEntry(**r))
        except Exception:
            continue
    return out


def _entry_from(rec: LedgerRecord) -> LedgerIndexEntry:
    rep = rec.report
    applied = sum(1 for g in rec.gaps if g.outcome and g.outcome.status == "applied")
    return LedgerIndexEntry(
        run_id=rep.run_id, instance=rep.instance, started_at=rep.generated_at,
        finished_at=rec.created_at, status="error" if rep.summary == "" and not rec.gaps else "done",
        model=rep.model, trigger=rec.trigger, gap_count=len(rec.gaps), applied_count=applied,
    )


def write_run(rec: LedgerRecord, *, root: Path | None = None) -> str:
    instance = rec.report.instance
    run_id = rec.report.run_id
    with _INDEX_LOCK:
        _atomic_write_json(_instance_dir(root, instance) / f"{run_id}.json", rec.model_dump())
        rows = [e for e in _read_index(root, instance) if e.run_id != run_id]
        rows.insert(0, _entry_from(rec))
        _atomic_write_json(_index_path(root, instance), [e.model_dump() for e in rows])
    return run_id


def read_run(instance: str, run_id: str, *, root: Path | None = None) -> LedgerRecord | None:
    p = _instance_dir(root, instance) / f"{run_id}.json"
    try:
        return LedgerRecord(**json.loads(p.read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError):
        return None


def list_runs(instance: str, limit: int = 50, *, root: Path | None = None) -> list[LedgerIndexEntry]:
    rows = _read_index(root, instance)
    rows.sort(key=lambda e: e.run_id, reverse=True)      # run_id is a sortable UTC stamp
    return rows[:limit]
```

- [ ] **Step 4: Run tests, verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_review_ledger.py -q`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add backend/review_ledger.py tests/test_review_ledger.py
git commit -m "Add review_ledger core: write_run/read_run/list_runs (atomic, indexed)"
```

---

## Task 3: update_gap_outcome + prune

**Files:**
- Modify: `backend/review_ledger.py`
- Test: `tests/test_review_ledger.py`

**Interfaces:**
- Consumes: Task 2 functions, `models.ApplyOutcome`.
- Produces: `update_gap_outcome(instance, run_id, gap_index:int, outcome:ApplyOutcome, *, root=None) -> LedgerRecord|None` (mutates that gap's outcome, atomically rewrites the run file, bumps the index `applied_count`); `prune(instance, keep:int=50, *, root=None) -> int` (deletes oldest run files beyond `keep`, trims index, returns count removed; never touches `*.bak*`).

- [ ] **Step 1: Write the failing test**

```python
from backend.models import ApplyOutcome


def test_update_gap_outcome(tmp_path):
    L.write_run(_rec(), root=tmp_path)
    rec = L.update_gap_outcome("local", "20260630T120000Z", 1,
                               ApplyOutcome(gap_index=1, status="applied", backup_path="b"), root=tmp_path)
    assert rec is not None and rec.gaps[1].outcome.status == "applied"
    assert L.read_run("local", "20260630T120000Z", root=tmp_path).gaps[1].outcome.status == "applied"
    assert L.list_runs("local", root=tmp_path)[0].applied_count == 1


def test_update_gap_outcome_bad_index(tmp_path):
    L.write_run(_rec(), root=tmp_path)
    assert L.update_gap_outcome("local", "20260630T120000Z", 9,
                                ApplyOutcome(gap_index=9, status="applied"), root=tmp_path) is None


def test_prune_keeps_newest(tmp_path):
    for h in range(5):
        L.write_run(_rec(run_id=f"20260630T1{h}0000Z"), root=tmp_path)
    removed = L.prune("local", keep=2, root=tmp_path)
    assert removed == 3
    ids = [e.run_id for e in L.list_runs("local", root=tmp_path)]
    assert ids == ["20260630T140000Z", "20260630T130000Z"]
```

- [ ] **Step 2: Run it, verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_review_ledger.py -k "outcome or prune" -q`
Expected: FAIL (AttributeError: module has no attribute 'update_gap_outcome').

- [ ] **Step 3: Implement**

Append to `backend/review_ledger.py`:

```python
def update_gap_outcome(instance: str, run_id: str, gap_index: int, outcome: ApplyOutcome,
                       *, root: Path | None = None) -> LedgerRecord | None:
    with _INDEX_LOCK:
        rec = read_run(instance, run_id, root=root)
        if rec is None or gap_index < 0 or gap_index >= len(rec.gaps):
            return None
        rec.gaps[gap_index].outcome = outcome
        _atomic_write_json(_instance_dir(root, instance) / f"{run_id}.json", rec.model_dump())
        rows = _read_index(root, instance)
        applied = sum(1 for g in rec.gaps if g.outcome and g.outcome.status == "applied")
        for e in rows:
            if e.run_id == run_id:
                e.applied_count = applied
        _atomic_write_json(_index_path(root, instance), [e.model_dump() for e in rows])
        return rec


def prune(instance: str, keep: int = 50, *, root: Path | None = None) -> int:
    with _INDEX_LOCK:
        rows = _read_index(root, instance)
        rows.sort(key=lambda e: e.run_id, reverse=True)
        drop = rows[keep:]
        d = _instance_dir(root, instance)
        removed = 0
        for e in drop:
            f = d / f"{e.run_id}.json"
            try:
                f.unlink()
                removed += 1
            except OSError:
                pass
        if drop:
            _atomic_write_json(_index_path(root, instance), [e.model_dump() for e in rows[:keep]])
        return removed
```

- [ ] **Step 4: Run tests, verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_review_ledger.py -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/review_ledger.py tests/test_review_ledger.py
git commit -m "Add review_ledger update_gap_outcome + prune"
```

---

## Task 4: Persist reviews + history endpoints

**Files:**
- Modify: `backend/app.py` (persist in `_do_review`; add 2 routes)
- Test: `tests/test_skill_review.py`

**Interfaces:**
- Consumes: `review_ledger.write_run/list_runs/read_run`, `models.LedgerRecord/GapRecord`, `skill_review.new_run_id` equivalent.
- Produces: a `LedgerRecord` written on each completed review (manual now; scheduler reuses later). Routes: `GET /api/skill-review/{instance}/runs -> list[LedgerIndexEntry]`; `GET /api/skill-review/{instance}/runs/{run_id} -> LedgerRecord` (404 if missing).

- [ ] **Step 1: Write the failing test**

```python
def test_review_persisted_to_ledger(monkeypatch, tmp_path):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr("backend.review_ledger.reviews_state_dir", lambda: tmp_path)
    cfg = AppConfig(instances=[Instance(name="local", transport="local", hermes_home="/h")],
                    enable_skill_review=True)
    client = _client(monkeypatch, cfg)
    monkeypatch.setattr("backend.app.sr.review",
                        lambda *a, **k: ReviewReport(summary="mocked", model="m", instance="local",
                                                     run_id="", trigger="manual"))
    r = client.post("/api/skill-review/local/run")
    assert r.status_code == 200
    import time
    for _ in range(50):
        if client.get("/api/skill-review/status").json()["status"] != "running":
            break
        time.sleep(0.05)
    runs = client.get("/api/skill-review/local/runs").json()
    assert len(runs) == 1 and runs[0]["instance"] == "local" and runs[0]["trigger"] == "manual"
    rid = runs[0]["run_id"]
    rec = client.get(f"/api/skill-review/local/runs/{rid}").json()
    assert rec["report"]["summary"] == "mocked"
    assert client.get("/api/skill-review/local/runs/nope").status_code == 404
```

- [ ] **Step 2: Run it, verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_skill_review.py::test_review_persisted_to_ledger -q`
Expected: FAIL (404 on /runs — route doesn't exist).

- [ ] **Step 3: Persist in `_do_review` and add routes**

In `backend/app.py`, add imports near the top:

```python
from backend import review_ledger as ledger
from backend.models import LedgerRecord, GapRecord
```

In `_do_review`, after `report.drift = drift` and before storing to `app.state.review_job`, stamp the run and persist:

```python
            report.run_id = report.run_id or ledger.new_run_id(datetime.now(timezone.utc))
            report.trigger = "manual"
            try:
                ledger.write_run(LedgerRecord(
                    report=report,
                    gaps=[GapRecord(gap=g) for g in report.gaps],
                    trigger=report.trigger,
                    created_at=datetime.now(timezone.utc).isoformat(),
                ))
            except Exception:
                pass     # ledger persistence must never fail the in-memory result
```

Add the routes (next to the other skill-review routes):

```python
    @app.get("/api/skill-review/{instance}/runs")
    def skill_review_runs(instance: str):
        _instance_or_404(instance)
        return ledger.list_runs(instance)

    @app.get("/api/skill-review/{instance}/runs/{run_id}")
    def skill_review_run_detail(instance: str, run_id: str):
        _instance_or_404(instance)
        rec = ledger.read_run(instance, run_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="run not found")
        return rec
```

- [ ] **Step 4: Run the test + full suite, verify pass**

Run: `.venv/Scripts/python -m pytest tests/test_skill_review.py -q` then `.venv/Scripts/python -m pytest -q`
Expected: PASS (the new test + all existing).

- [ ] **Step 5: Commit**

```bash
git add backend/app.py tests/test_skill_review.py
git commit -m "Persist reviews to the ledger + history endpoints"
```

---

## Task 5: Frontend — Past Reviews list

**Files:**
- Modify: `frontend/src/types.ts` (add `LedgerIndexEntry`)
- Modify: `frontend/src/review/api.ts` (add `listRuns`)
- Modify: `frontend/src/review/ReviewTab.tsx` (a "Past reviews" section)
- Test: `frontend/src/review/__tests__/ReviewTab.test.tsx`

**Interfaces:**
- Consumes: `GET /api/skill-review/{instance}/runs`.
- Produces: a small history list under the report (trigger badge + gap/applied counts + timestamp).

- [ ] **Step 1: Add the type + api**

In `frontend/src/types.ts`:

```typescript
export type LedgerIndexEntry = {
  run_id: string; instance: string; started_at: string; finished_at: string;
  status: string; model: string; trigger: string; gap_count: number; applied_count: number;
};
```

In `frontend/src/review/api.ts`:

```typescript
import type { ReviewJob, LedgerIndexEntry } from '../types';

export async function listRuns(instance: string): Promise<LedgerIndexEntry[]> {
  const res = await fetch(`/api/skill-review/${encodeURIComponent(instance)}/runs`);
  if (!res.ok) return [];
  return res.json();
}
```

- [ ] **Step 2: Write the failing test**

```typescript
it('shows past reviews from the ledger', async () => {
  vi.mocked(api.listRuns).mockResolvedValue([
    { run_id: '20260630T120000Z', instance: 'local', started_at: '', finished_at: '',
      status: 'done', model: 'm', trigger: 'scheduled', gap_count: 3, applied_count: 1 },
  ]);
  render(<ReviewTab instances={['local']} />);
  expect(await screen.findByText(/scheduled/)).toBeInTheDocument();
  expect(screen.getByText(/3 gaps/)).toBeInTheDocument();
});
```
(Add `listRuns: vi.fn()` expectations to the existing `vi.mock('../api')` setup.)

- [ ] **Step 3: Run it, verify it fails**

Run: `cd frontend && npx vitest run src/review`
Expected: FAIL (no "scheduled" text).

- [ ] **Step 4: Render the list in ReviewTab**

In `ReviewTab.tsx`, add state `const [runs, setRuns] = useState<LedgerIndexEntry[]>([])`, fetch in the existing mount effect (`listRuns(instance).then(setRuns)`), and render below the report:

```tsx
{runs.length > 0 && (
  <Section label="Past reviews">
    <div className="space-y-1.5">
      {runs.map((r) => (
        <div key={r.run_id} className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ background: '#0a0a0b' }}>
          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ color: r.trigger === 'scheduled' ? '#38bdf8' : '#a1a1aa', background: '#ffffff10' }}>{r.trigger}</span>
          <span style={{ color: '#a1a1aa' }}>{r.gap_count} gaps · {r.applied_count} applied</span>
          <span className="ml-auto text-xs font-mono" style={{ color: '#3f3f46' }}>{r.run_id}</span>
        </div>
      ))}
    </div>
  </Section>
)}
```

- [ ] **Step 5: Run tests + build, verify pass**

Run: `npx vitest run src/review` then `npm run build`
Expected: PASS + clean build.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/review/api.ts frontend/src/review/ReviewTab.tsx frontend/src/review/__tests__/ReviewTab.test.tsx
git commit -m "Show past reviews (ledger history) in the Review tab"
```

---

## Self-Review (coverage vs spec §9)

- §9 JSON-per-run + index → Tasks 2-3. Atomic writes → `_atomic_write_json` (Task 2). 0700/0600 perms → `_instance_dir`/`_atomic_write_json` (Task 2). Own lock (not review_lock) → `_INDEX_LOCK` (Task 2). `run_id` UTC stamp → `new_run_id` (Task 2). `update_gap_outcome` + `prune` (backups untouched — prune only deletes `<run_id>.json`) → Task 3. Persist every report → Task 4. History API + UI → Tasks 4-5.
- Out of scope here (later subsystems): `ApplyOutcome` is defined now but only *populated* by write-back (subsystem 3); `trigger="scheduled"` rows are written by the scheduler (subsystem 2) via the same `write_run`.
- No placeholders; types consistent (`LedgerRecord`/`LedgerIndexEntry`/`ApplyOutcome`/`GapRecord` identical across tasks and matching the spec §4 model list).
