from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from backend.aggregator import Aggregator
from backend import settings
from backend.settings import (
    AppConfig,
    actions_writable,
    anthropic_key,
    config_writable,
    resolve_config_path,
    save,
    skill_review_available,
    skill_writeback_available,
    validate,
)
from backend import kanban_actions
from backend import session_detail
from backend import skill_review as sr
from backend.collectors.sessions import collect_sessions
from uuid import uuid4

from backend import review_ledger as ledger
from backend import skill_writeback as wb
from backend.review_scheduler import start_scheduler
from backend.models import Features, GapRecord, LedgerRecord, ProposedEdit, ReviewJob
from backend.transport import make_runner


def _effective_bind_host(config: AppConfig) -> str:
    """The host the server is actually bound to. `argus serve` sets ARGUS_BIND_HOST
    so the write guard reflects a `--host` override, not just the file value."""
    return os.environ.get("ARGUS_BIND_HOST") or config.host


def create_app(config=None, aggregator=None) -> FastAPI:
    config = config or settings.load()
    agg = aggregator or Aggregator(config)
    bind_host = _effective_bind_host(config)
    app = FastAPI(title="Argus", description="Hermes fleet mission control (read-only)")

    @app.get("/api/overview")
    def overview():
        now_iso = datetime.now(timezone.utc).isoformat()
        ov = agg.get(now_iso)
        # features depend on the bound host + key, which the aggregator doesn't see.
        ov.features = Features(
            skill_review=skill_review_available(agg.config, bind_host),
            skill_writeback=skill_writeback_available(agg.config, bind_host),
        )
        return ov

    @app.get("/api/config")
    def get_config():
        cfg: AppConfig = agg.config
        return {
            "config": cfg.model_dump(exclude_none=True),
            "meta": {
                "path": str(resolve_config_path()),
                "writable": config_writable(cfg, bind_host),
                "localhost_bound": settings.is_localhost(bind_host),
                "writes_enabled": cfg.enable_config_writes,
            },
        }

    @app.put("/api/config")
    def put_config(body: dict):
        cfg: AppConfig = agg.config
        if not config_writable(cfg, bind_host):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Config writes are disabled. Set enable_config_writes: true and "
                    "bind Argus to localhost to edit settings from the UI."
                ),
            )
        try:
            new_cfg = validate(body)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        save(new_cfg)
        agg.replace_config(new_cfg)
        return {"ok": True, "config": new_cfg.model_dump(exclude_none=True)}

    def _instance_or_404(name: str):
        for inst in agg.config.instances:
            if inst.name == name:
                return inst
        raise HTTPException(status_code=404, detail=f"no instance named {name!r}")

    # --- skill review: long async job tracked in app.state so progress survives
    # page reloads / tab switches (a run can take minutes). ---
    app.state.review_job = ReviewJob()
    app.state.proposals = {}            # proposal_id -> pending rewrite (server-stored bytes, R4)
    review_lock = threading.Lock()

    def _do_review(instance: str, inst, started_at: str, trigger: str = "manual"):
        try:
            runner = make_runner(inst)
            events = sr.read_trajectory(runner, inst)
            sessions = collect_sessions(runner, inst, limit=12)
            reviewed = ledger.reviewed_session_ids(instance)
            ids = sr.triage(events, sessions, limit=3, reviewed_sids=reviewed)
            skills, names, custom = sr.gather_skills(runner, inst)

            # cross-instance drift (deterministic, no LLM)
            per_inst = {inst.name: custom}
            for other in agg.config.instances:
                if other.name != inst.name:
                    try:
                        _, _, oc = sr.gather_skills(make_runner(other), other)
                        per_inst[other.name] = oc
                    except Exception:
                        pass
            drift = sr.skill_drift(per_inst)

            memory = sr.gather_memory(runner, inst)
            applied = ledger.applied_history(instance)
            context = sr.assemble(runner, inst, ids, skills, names, memory=memory, applied=applied)
            now_iso = datetime.now(timezone.utc).isoformat()
            report = sr.review(context, agg.config.skill_review_model, anthropic_key(agg.config),
                               instance, ids, now_iso, claude_bin=agg.config.claude_bin)
            report.drift = drift
            report.run_id = report.run_id or ledger.new_run_id(datetime.now(timezone.utc))
            report.trigger = trigger
            try:
                ledger.write_run(LedgerRecord(
                    report=report,
                    gaps=[GapRecord(gap=g) for g in report.gaps],
                    trigger=report.trigger,
                    created_at=datetime.now(timezone.utc).isoformat(),
                ))
            except Exception:
                pass     # ledger persistence must never fail the in-memory result
            with review_lock:
                app.state.review_job = ReviewJob(
                    status="done", instance=instance, started_at=started_at,
                    finished_at=datetime.now(timezone.utc).isoformat(), report=report,
                )
        except Exception as e:  # noqa: BLE001 — surface any failure to the UI
            with review_lock:
                app.state.review_job = ReviewJob(
                    status="error", instance=instance, started_at=started_at,
                    finished_at=datetime.now(timezone.utc).isoformat(), error=str(e)[:300],
                )

    def start_review(instance: str, inst, trigger: str = "manual"):
        """Atomic single-flight: start a review if none is running, else return None.
        Used by BOTH the manual endpoint and the scheduler so they never overlap (R11)."""
        started_at = datetime.now(timezone.utc).isoformat()
        with review_lock:
            if app.state.review_job.status == "running":
                return None
            running = ReviewJob(status="running", instance=instance, started_at=started_at)
            app.state.review_job = running
        threading.Thread(target=_do_review, args=(instance, inst, started_at, trigger), daemon=True).start()
        return running

    @app.post("/api/skill-review/{instance}/run")
    def skill_review_run(instance: str):
        inst = _instance_or_404(instance)
        if not skill_review_available(agg.config, bind_host):
            raise HTTPException(
                status_code=403,
                detail=("Skill review is off. Set enable_skill_review: true, bind Argus to "
                        "localhost, and provide an ANTHROPIC_API_KEY."),
            )
        running = start_review(instance, inst, "manual")
        if running is None:
            raise HTTPException(
                status_code=409,
                detail=f"a review is already running for {app.state.review_job.instance!r}",
            )
        return running

    @app.get("/api/skill-review/status")
    def skill_review_status():
        return getattr(app.state, "review_job", None) or ReviewJob()

    @app.get("/api/skill-review/report")
    def skill_review_report():
        # back-compat: the report from the most recent completed run, or null
        job = getattr(app.state, "review_job", None)
        return job.report if job and job.status == "done" else None

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

    def _writeback_gate():
        if not skill_writeback_available(agg.config, bind_host):
            raise HTTPException(
                status_code=403,
                detail=("Skill write-back is off. Set enable_skill_writeback: true and run via "
                        "`argus serve` bound to localhost."),
            )

    @app.post("/api/skill-review/{instance}/propose-edit")
    def propose_edit(instance: str, body: dict):
        inst = _instance_or_404(instance)
        _writeback_gate()
        run_id = str(body.get("run_id") or "")
        gap_index = int(body.get("gap_index") or 0)
        rec = ledger.read_run(instance, run_id)
        if rec is None or gap_index < 0 or gap_index >= len(rec.gaps):
            raise HTTPException(status_code=404, detail="run or gap not found")
        gap = rec.gaps[gap_index].gap
        runner = make_runner(inst)
        is_new = gap.target_skill.strip().lower() == "new"
        _, all_names, _ = sr.gather_skills(runner, inst)
        if is_new:
            path = wb.new_skill_path(inst, str(body.get("new_skill_name") or ""))
            if path is None:
                raise HTTPException(status_code=422, detail="new skill requires a valid name")
            cur, full, old_sha = None, "", ""
        else:
            path = wb.resolve_skill_path(runner, inst, gap.target_skill, all_names)
            if path is None:
                raise HTTPException(status_code=422, detail=f"could not locate skill {gap.target_skill!r}")
            cur = runner.read_bytes(path)
            full = (cur or b"").decode("utf-8", "replace")
            old_sha = wb.sha256(cur or b"")
        try:
            new_content, note = wb.rewrite_skill(full, gap, agg.config.skill_review_model,
                                                 anthropic_key(agg.config), claude_bin=agg.config.claude_bin)
            warnings = wb.sanity_check(full, new_content)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)[:300])
        proposal_id = uuid4().hex
        app.state.proposals[proposal_id] = {
            "new_bytes": new_content.encode("utf-8"), "path": path, "old_sha": old_sha,
            "gap_index": gap_index, "run_id": run_id, "is_new": is_new, "instance": instance,
        }
        return ProposedEdit(
            proposal_id=proposal_id, run_id=run_id, gap_index=gap_index, skill_name=gap.target_skill,
            path=path, is_new=is_new, old_sha256=old_sha, diff=wb.compute_diff(full, new_content, path),
            change_note=note, warnings=warnings, injection_flags=wb.injection_scan(full, new_content),
        )

    @app.post("/api/skill-review/{instance}/apply-edit")
    def apply_edit(instance: str, body: dict):
        inst = _instance_or_404(instance)
        _writeback_gate()
        prop = app.state.proposals.get(str(body.get("proposal_id") or ""))
        if not prop or prop["instance"] != instance:
            raise HTTPException(status_code=404, detail="proposal not found — re-propose")
        runner = make_runner(inst)

        def _save_backup(cur_bytes: bytes) -> str:
            return ledger.save_backup(instance, prop["path"], cur_bytes, datetime.now(timezone.utc))

        outcome = wb.apply_edit(runner, prop["gap_index"], prop["path"], prop["old_sha"],
                                prop["new_bytes"], is_new=prop["is_new"], save_backup=_save_backup)
        ledger.update_gap_outcome(instance, prop["run_id"], prop["gap_index"], outcome)
        if outcome.status == "applied":
            app.state.proposals.pop(str(body.get("proposal_id")), None)
            return outcome
        if outcome.status == "conflict":
            raise HTTPException(status_code=409, detail=outcome.error)
        raise HTTPException(status_code=400, detail=outcome.error)

    @app.get("/api/sessions/{instance}/{session_id}")
    def session_drilldown(instance: str, session_id: str):
        inst = _instance_or_404(instance)
        detail = session_detail.collect_session(make_runner(inst), inst, session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="session not found or not exportable")
        return detail

    @app.get("/api/kanban/{instance}/board")
    def kanban_board(instance: str):
        inst = _instance_or_404(instance)
        runner = make_runner(inst)
        tasks = kanban_actions.read_board(runner, inst)
        profiles = kanban_actions.read_assignees(runner, inst) or (
            [inst.profile] if inst.profile else []
        )
        return {
            "tasks": tasks,
            "meta": {
                "instance": instance,
                "writable": actions_writable(agg.config, bind_host),
                "actions_enabled": agg.config.enable_actions,
                "profiles": profiles,
            },
        }

    @app.get("/api/kanban/{instance}/task/{task_id}")
    def kanban_task(instance: str, task_id: str):
        inst = _instance_or_404(instance)
        task = kanban_actions.read_task(make_runner(inst), inst, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        return task

    @app.post("/api/kanban/{instance}/action")
    def kanban_action(instance: str, body: dict):
        inst = _instance_or_404(instance)
        if not actions_writable(agg.config, bind_host):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Actions are disabled. Set enable_actions: true and bind Argus to "
                    "localhost to act on the board."
                ),
            )
        verb = str(body.get("verb") or "")
        task_id = body.get("task_id")
        args = body.get("args") or {}
        try:
            r = kanban_actions.run_action(make_runner(inst), inst, verb, task_id, args)
        except kanban_actions.ActionError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if not r.ok:
            raise HTTPException(status_code=400, detail=(r.stderr or r.stdout or "action failed").strip()[:400])
        return {"ok": True, "stdout": (r.stdout or "").strip()}

    def _last_runs() -> dict:
        """Most-recent run time per instance (local-naive), for the scheduler's level-trigger.
        Seeded from the ledger so a restart doesn't re-fire a schedule already satisfied today."""
        out: dict = {}
        for i in agg.config.instances:
            runs = ledger.list_runs(i.name, limit=1)
            out[i.name] = _iso_to_local_naive(runs[0].started_at) if runs else None
        return out

    @app.on_event("startup")
    def _start_scheduler():
        sched, stop = start_scheduler(
            lambda: agg.config, start_review, _last_runs,
            available=skill_review_available(agg.config, bind_host),
        )
        app.state.review_scheduler = sched
        app.state.review_scheduler_stop = stop

    @app.on_event("shutdown")
    def _stop_scheduler():
        stop = getattr(app.state, "review_scheduler_stop", None)
        if stop is not None:
            stop.set()

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")

    return app


def _iso_to_local_naive(s: str):
    """Parse a UTC-ish ISO timestamp to a local naive datetime (the scheduler works in local time)."""
    try:
        dt = datetime.fromisoformat((s or "").replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone().replace(tzinfo=None)
        return dt
    except Exception:
        return None
