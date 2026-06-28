import backend.transport as T
from backend.transport import LocalRunner, SshRunner
from tests.conftest import make_instance


class _P:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


def test_local_runner_invokes_hermes_bin(monkeypatch):
    calls = {}

    def fake_run(cmd, **kwargs):
        calls["cmd"] = cmd
        return _P(0, "ok", "")

    monkeypatch.setattr(T.subprocess, "run", fake_run)
    r = LocalRunner(make_instance(home="/h")).run(["gateway", "status"])
    assert calls["cmd"][0] == "hermes"
    assert "-p" in calls["cmd"] and "gateway" in calls["cmd"]
    assert r.ok and r.stdout == "ok"


def test_ssh_runner_builds_ssh_command(monkeypatch):
    calls = {}

    def fake_run(cmd, **kwargs):
        calls["cmd"] = cmd
        return _P(0, "1", "")

    monkeypatch.setattr(T.subprocess, "run", fake_run)
    inst = make_instance(name="vps", transport="ssh", home="/home/u/.hermes")
    inst.ssh, inst.ssh_key = "u@h", "/k"
    SshRunner(inst).run(["kanban", "list", "--json"])
    cmd = calls["cmd"]
    assert cmd[0] == "ssh" and "/k" in cmd and "u@h" in cmd
    assert "kanban" in cmd[-1] and "--json" in cmd[-1]


def test_local_read_missing_returns_none(tmp_path):
    assert LocalRunner(make_instance()).read(str(tmp_path / "nope")) is None


def test_exec_never_raises(monkeypatch):
    def boom(*a, **k):
        raise OSError("no binary")

    monkeypatch.setattr(T.subprocess, "run", boom)
    assert LocalRunner(make_instance()).run(["x"]).ok is False
