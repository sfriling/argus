from datetime import datetime, timezone

from backend import review_ledger as L
from backend.models import (
    ApplyOutcome, GapRecord, LedgerRecord, ReviewReport, SkillGap,
)

NOW = datetime(2026, 6, 30, 12, 0, 0, tzinfo=timezone.utc)


def _rec(instance="local", run_id="20260630T120000Z"):
    return LedgerRecord(
        report=ReviewReport(summary="s", instance=instance, model="m", run_id=run_id, trigger="manual"),
        gaps=[GapRecord(gap=SkillGap(title="g1")), GapRecord(gap=SkillGap(title="g2"))],
        trigger="manual", created_at="2026-06-30T12:00:00Z",
    )


# --- Task 1: models ----------------------------------------------------------

def test_ledger_models_roundtrip():
    rec = _rec()
    back = LedgerRecord(**rec.model_dump())
    assert back.report.run_id == "20260630T120000Z"
    assert back.gaps[0].gap.title == "g1"
    assert back.gaps[0].outcome is None
    o = ApplyOutcome(gap_index=0, status="applied", backup_path="b")
    assert o.status == "applied"


# --- Task 2: core ------------------------------------------------------------

def test_new_run_id_format():
    assert L.new_run_id(NOW) == "20260630T120000Z"


def test_write_read_list_roundtrip(tmp_path):
    rid = L.write_run(_rec(), root=tmp_path)
    assert rid == "20260630T120000Z"
    got = L.read_run("local", rid, root=tmp_path)
    assert got is not None and got.report.summary == "s" and len(got.gaps) == 2
    idx = L.list_runs("local", root=tmp_path)
    assert len(idx) == 1 and idx[0].run_id == rid and idx[0].gap_count == 2


def test_list_runs_newest_first_and_missing_instance(tmp_path):
    L.write_run(_rec(run_id="20260630T120000Z"), root=tmp_path)
    L.write_run(_rec(run_id="20260630T130000Z"), root=tmp_path)
    ids = [e.run_id for e in L.list_runs("local", root=tmp_path)]
    assert ids == ["20260630T130000Z", "20260630T120000Z"]
    assert L.list_runs("nobody", root=tmp_path) == []


# --- Task 3: update_gap_outcome + prune --------------------------------------

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


# --- applied-history / reviewed-sessions (dedup support) ---------------------

def test_applied_history_and_reviewed_sessions(tmp_path):
    from backend.models import ApplyOutcome
    # run A: one gap applied; run B: no applies
    # run A reviewed sessA1+sessA2; the APPLIED gap cites only sessA1 in its evidence
    recA = LedgerRecord(
        report=ReviewReport(summary="s", instance="local", model="m", run_id="20260630T120000Z",
                            sessions_reviewed=["sessA1", "sessA2"]),
        gaps=[GapRecord(gap=SkillGap(title="patch loop", target_skill="obsidian",
                                     evidence="session sessA1 looped on patch")),
              GapRecord(gap=SkillGap(title="other", target_skill="kanban", evidence="session sessA2"))],
        trigger="manual", created_at="2026-06-30T12:00:00Z",
    )
    L.write_run(recA, root=tmp_path)
    L.update_gap_outcome("local", "20260630T120000Z", 0,
                         ApplyOutcome(gap_index=0, status="applied", applied_at="2026-06-30T12:05:00Z"),
                         root=tmp_path)
    recB = LedgerRecord(
        report=ReviewReport(summary="s", instance="local", model="m", run_id="20260629T120000Z",
                            sessions_reviewed=["sessB1"]),
        gaps=[GapRecord(gap=SkillGap(title="x", target_skill="y"))],
        trigger="manual", created_at="2026-06-29T12:00:00Z",
    )
    L.write_run(recB, root=tmp_path)

    hist = L.applied_history("local", root=tmp_path)
    assert len(hist) == 1                                # only the applied gap
    assert hist[0] == {"skill": "obsidian", "title": "patch loop", "applied_at": "2026-06-30T12:05:00Z"}

    # only sessA1 (cited in the APPLIED gap's evidence) is "acted on" — NOT sessA2 (its gap was skipped)
    assert L.reviewed_session_ids("local", root=tmp_path) == {"sessA1"}


def test_applied_history_falls_back_when_applied_at_empty(tmp_path):
    from backend.models import ApplyOutcome
    L.write_run(LedgerRecord(
        report=ReviewReport(summary="s", instance="local", model="m", run_id="20260630T120000Z"),
        gaps=[GapRecord(gap=SkillGap(title="t", target_skill="obsidian"))],
        trigger="manual", created_at="2026-06-30T12:00:00Z",
    ), root=tmp_path)
    # outcome with NO applied_at (legacy/corrupt) -> date must not be unknown
    L.update_gap_outcome("local", "20260630T120000Z", 0,
                         ApplyOutcome(gap_index=0, status="applied", applied_at=""), root=tmp_path)
    hist = L.applied_history("local", root=tmp_path)
    assert hist[0]["applied_at"] == "2026-06-30T12:00:00Z"   # fell back to the run's finished_at
