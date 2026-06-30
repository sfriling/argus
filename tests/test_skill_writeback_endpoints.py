from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import AppConfig, Instance
from backend.models import (
    GapRecord, HealthRecord, LedgerRecord, Overview, ReviewReport, SkillGap, SkillHealth,
)
from backend import review_ledger as ledger
from backend.transport import RunResult, WriteResult


SKILL_PATH = "/h/profiles/orchestrator/skills/x/myskill/SKILL.md"


class _WBRunner:
    """In-memory runner supporting the skills-list parse + byte read/write the endpoints use."""
    def __init__(self):
        self.files = {SKILL_PATH: b"---\nname: myskill\n---\n# Old\nbody\n"}
    def run(self, args, timeout=8):
        return RunResult(ok=True, stdout="│ myskill │ x │ local │ local │ enabled │\n")
    def read(self, path, timeout=8):
        b = self.files.get(path)
        return b.decode() if b is not None else None
    def read_bytes(self, path, timeout=8):
        return self.files.get(path)
    def write_file(self, path, content, *, exclusive=False, timeout=20):
        if exclusive and path in self.files:
            return WriteResult(ok=False, error="exists")
        self.files[path] = content
        return WriteResult(ok=True, bytes_written=len(content))
    def exists(self, path, timeout=8):
        return path in self.files
    def list_dir(self, path, timeout=8):
        return []


def _client(monkeypatch, tmp_path, *, writeback=True, bind="127.0.0.1"):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setenv("ARGUS_BIND_HOST", bind)                 # R10: write gate needs this set
    monkeypatch.setattr("backend.review_ledger.reviews_state_dir", lambda: tmp_path / "reviews")
    runner = _WBRunner()
    monkeypatch.setattr("backend.app.make_runner", lambda inst: runner)
    # avoid real Claude / skills-list resolution variance
    monkeypatch.setattr("backend.app.sr.gather_skills", lambda r, i: ({}, ["myskill"], set()))
    monkeypatch.setattr("backend.app.wb.rewrite_skill",
                        lambda *a, **k: ("---\nname: myskill\n---\n# New\nbody + a rule\n", "added a rule"))
    cfg = AppConfig(
        instances=[Instance(name="local", transport="local", hermes_home="/h", profile="orchestrator")],
        enable_skill_review=True, enable_skill_writeback=writeback,
    )

    class StubAgg:
        def __init__(self): self.config = cfg
        def get(self, *a, **k): return Overview()

    client = TestClient(create_app(config=cfg, aggregator=StubAgg()))
    # seed a completed run with one gap AND one health finding into the ledger
    health = SkillHealth(skill="myskill", finding="legacy <EOM> instruction", severity="warn")
    ledger.write_run(LedgerRecord(
        report=ReviewReport(summary="s", instance="local", model="m", run_id="20260630T120000Z",
                            health=[health]),
        gaps=[GapRecord(gap=SkillGap(title="harden", target_skill="myskill",
                                     recommendation="add a rule", suggested_edit="..."))],
        health=[HealthRecord(health=health)],
        trigger="manual", created_at=datetime.now(timezone.utc).isoformat(),
    ), root=tmp_path / "reviews")
    return client, runner


def test_propose_then_apply_health_fix(monkeypatch, tmp_path):
    client, runner = _client(monkeypatch, tmp_path)
    p = client.post("/api/skill-review/local/propose-edit",
                    json={"run_id": "20260630T120000Z", "health_index": 0})
    assert p.status_code == 200, p.text
    pid = p.json()["proposal_id"]
    assert p.json()["skill_name"] == "myskill"
    a = client.post("/api/skill-review/local/apply-edit", json={"proposal_id": pid})
    assert a.status_code == 200 and a.json()["status"] == "applied"
    # the health item's outcome is recorded in the ledger (so the UI can show it applied)
    rec = client.get("/api/skill-review/local/runs/20260630T120000Z").json()
    assert rec["health"][0]["outcome"]["status"] == "applied"


def test_writeback_gated_off_returns_403(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path, writeback=False)
    assert client.post("/api/skill-review/local/propose-edit",
                       json={"run_id": "20260630T120000Z", "gap_index": 0}).status_code == 403
    assert client.post("/api/skill-review/local/apply-edit", json={"proposal_id": "x"}).status_code == 403


def test_writeback_gated_off_when_not_localhost(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path, bind="0.0.0.0")    # R10: public bind -> no writes
    assert client.post("/api/skill-review/local/propose-edit",
                       json={"run_id": "20260630T120000Z", "gap_index": 0}).status_code == 403


def test_propose_then_apply_happy(monkeypatch, tmp_path):
    client, runner = _client(monkeypatch, tmp_path)
    p = client.post("/api/skill-review/local/propose-edit",
                    json={"run_id": "20260630T120000Z", "gap_index": 0})
    assert p.status_code == 200, p.text
    body = p.json()
    assert body["path"] == SKILL_PATH and body["proposal_id"]
    assert "# New" in body["diff"] and body["old_sha256"]
    # apply writes the server-stored bytes (R4) byte-exact
    a = client.post("/api/skill-review/local/apply-edit", json={"proposal_id": body["proposal_id"]})
    assert a.status_code == 200, a.text
    assert a.json()["status"] == "applied"
    assert runner.files[SKILL_PATH] == b"---\nname: myskill\n---\n# New\nbody + a rule\n"
    # ledger recorded the apply outcome
    rec = client.get("/api/skill-review/local/runs/20260630T120000Z").json()
    assert rec["gaps"][0]["outcome"]["status"] == "applied"


def test_apply_unknown_proposal_404(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    assert client.post("/api/skill-review/local/apply-edit",
                       json={"proposal_id": "nope"}).status_code == 404


def test_apply_conflict_when_file_changed(monkeypatch, tmp_path):
    client, runner = _client(monkeypatch, tmp_path)
    body = client.post("/api/skill-review/local/propose-edit",
                       json={"run_id": "20260630T120000Z", "gap_index": 0}).json()
    runner.files[SKILL_PATH] = b"changed underneath\n"          # someone edited it
    a = client.post("/api/skill-review/local/apply-edit", json={"proposal_id": body["proposal_id"]})
    assert a.status_code == 409
