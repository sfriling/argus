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


def test_local_write_is_byte_exact_preserves_crlf(tmp_path):
    # R1: a CRLF payload must land byte-for-byte (no newline translation), and read_bytes
    # must return the exact bytes — the whole point after the reconciliation CRLF wall.
    p = tmp_path / "SKILL.md"
    payload = b"a\r\nb\n\xe2\x9c\x93\n"          # CRLF + LF + a UTF-8 check mark
    r = LocalRunner(make_instance()).write_file(str(p), payload)
    assert r.ok and r.bytes_written == len(payload)
    assert p.read_bytes() == payload
    assert LocalRunner(make_instance()).read_bytes(str(p)) == payload


def test_local_write_atomic_overwrite(tmp_path):
    p = tmp_path / "s" / "SKILL.md"
    run = LocalRunner(make_instance())
    assert run.write_file(str(p), b"v1").ok          # creates dirs
    assert run.write_file(str(p), b"v2").ok           # overwrites
    assert p.read_bytes() == b"v2"


def test_local_write_exclusive_fails_if_exists(tmp_path):
    # R7: exclusive create must refuse to clobber an existing file
    p = tmp_path / "SKILL.md"
    run = LocalRunner(make_instance())
    assert run.write_file(str(p), b"orig").ok
    r = run.write_file(str(p), b"new", exclusive=True)
    assert r.ok is False and r.error == "exists"
    assert p.read_bytes() == b"orig"                  # untouched


def test_ssh_write_command_shape_and_bytes(monkeypatch):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["input"] = kwargs.get("input")
        captured["text"] = kwargs.get("text")
        return _P(0, "", "")

    monkeypatch.setattr(T.subprocess, "run", fake_run)
    inst = make_instance(name="vps", transport="ssh")
    inst.ssh, inst.ssh_key = "u@h", "/k"
    r = SshRunner(inst).write_file("/home/u/.hermes/skills/x/SKILL.md", b"data\r\n", exclusive=True)
    assert r.ok
    remote = captured["cmd"][-1]
    assert "cat > " in remote and "mv -f" in remote and "exit 9" in remote   # atomic + exclusive guard
    assert captured["input"] == b"data\r\n"            # content on stdin as raw bytes
    assert captured["text"] in (None, False)           # NOT text mode (byte-exact)
