"""Persistent JSON-per-run ledger for skill reviews. Each completed run is one file
`<state_dir>/reviews/<instance>/<run_id>.json` plus a lightweight `index.json`. All writes
are atomic (tempfile + os.replace); the index read-modify-write is serialized by this
module's OWN lock (never the review lock) to avoid deadlock. Files 0600, dirs 0700 — runs
can quote memory-derived text."""
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
    base = _root(root)
    d = base / instance
    d.mkdir(parents=True, exist_ok=True)
    for p in (base, d):
        try:
            os.chmod(p, 0o700)
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
    try:
        rows = json.loads(_index_path(root, instance).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out: list[LedgerIndexEntry] = []
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
        finished_at=rec.created_at, status="done", model=rep.model, trigger=rec.trigger,
        gap_count=len(rec.gaps), applied_count=applied,
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


def save_backup(instance: str, skill_path: str, content: bytes, now: datetime,
                *, root: Path | None = None) -> str:
    """Persist the prior bytes of a SKILL.md OUTSIDE the synced skills tree (R8), under the Argus
    state dir, with a collision-proof high-res name (exclusive create)."""
    skill = Path(skill_path).parent.name or "skill"
    d = _instance_dir(root, instance) / "backups" / skill
    d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(d, 0o700)
    except OSError:
        pass
    stamp = now.strftime("%Y%m%dT%H%M%S_%f") + "Z"
    p = d / f"{stamp}.bak"
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(content)
    return str(p)


def prune(instance: str, keep: int = 50, *, root: Path | None = None) -> int:
    with _INDEX_LOCK:
        rows = _read_index(root, instance)
        rows.sort(key=lambda e: e.run_id, reverse=True)
        drop = rows[keep:]
        d = _instance_dir(root, instance)
        removed = 0
        for e in drop:
            try:
                (d / f"{e.run_id}.json").unlink()
                removed += 1
            except OSError:
                pass
        if drop:
            _atomic_write_json(_index_path(root, instance), [e.model_dump() for e in rows[:keep]])
        return removed
