from __future__ import annotations

import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol


@dataclass
class RunResult:
    ok: bool
    stdout: str = ""
    stderr: str = ""


@dataclass
class WriteResult:
    ok: bool
    bytes_written: int = 0
    error: str = ""


class Runner(Protocol):
    def run(self, args: list[str], timeout: int = 8) -> RunResult: ...
    def read(self, path: str, timeout: int = 8) -> Optional[str]: ...
    def read_bytes(self, path: str, timeout: int = 8) -> Optional[bytes]: ...
    def write_file(self, path: str, content: bytes, *, exclusive: bool = False, timeout: int = 20) -> WriteResult: ...
    def exists(self, path: str, timeout: int = 8) -> bool: ...
    def list_dir(self, path: str, timeout: int = 8) -> list[str]: ...


# On Windows, when the server runs under pythonw (no console of its own), each
# console-subsystem child (hermes.exe, ssh.exe) would otherwise pop a NEW terminal
# window. CREATE_NO_WINDOW suppresses that. No-op / absent on POSIX.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _exec(cmd: list[str], timeout: int) -> RunResult:
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout,
            stdin=subprocess.DEVNULL, creationflags=_NO_WINDOW,
        )
        return RunResult(ok=(p.returncode == 0), stdout=p.stdout or "", stderr=p.stderr or "")
    except Exception as e:  # timeout, missing binary, etc. — never raise into a collector
        return RunResult(ok=False, stderr=str(e))


def _exec_in(cmd: list[str], timeout: int, input_bytes: bytes) -> RunResult:
    """Like _exec but feeds raw BYTES on stdin with NO text translation (byte-exact, R1)."""
    try:
        p = subprocess.run(
            cmd, input=input_bytes, capture_output=True, timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        return RunResult(
            ok=(p.returncode == 0),
            stdout=(p.stdout or b"").decode("utf-8", "replace"),
            stderr=(p.stderr or b"").decode("utf-8", "replace"),
        )
    except Exception as e:
        return RunResult(ok=False, stderr=str(e))


class LocalRunner:
    """Runs the local `hermes` binary and reads local files directly."""

    def __init__(self, instance):
        self.i = instance

    def run(self, args: list[str], timeout: int = 8) -> RunResult:
        return _exec([self.i.hermes_bin, "-p", self.i.profile, *args], timeout)

    def read(self, path: str, timeout: int = 8) -> Optional[str]:
        try:
            return Path(path).read_text(encoding="utf-8", errors="replace")
        except Exception:
            return None

    def read_bytes(self, path: str, timeout: int = 8) -> Optional[bytes]:
        try:
            return Path(path).read_bytes()
        except Exception:
            return None

    def write_file(self, path: str, content: bytes, *, exclusive: bool = False, timeout: int = 20) -> WriteResult:
        try:
            import os
            import tempfile
            d = os.path.dirname(path) or "."
            os.makedirs(d, exist_ok=True)
            if exclusive and os.path.exists(path):
                return WriteResult(ok=False, error="exists")
            fd, tmp = tempfile.mkstemp(dir=d, suffix=".argus-tmp")
            try:
                with os.fdopen(fd, "wb") as fh:      # BINARY — no newline translation (R1)
                    fh.write(content)
                os.replace(tmp, path)
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            return WriteResult(ok=True, bytes_written=len(content))
        except Exception as e:
            return WriteResult(ok=False, error=str(e))

    def exists(self, path: str, timeout: int = 8) -> bool:
        try:
            return Path(path).exists()
        except Exception:
            return False

    def list_dir(self, path: str, timeout: int = 8) -> list[str]:
        try:
            return sorted(p.name for p in Path(path).iterdir() if p.is_dir())
        except Exception:
            return []

    def list_files(self, path: str, timeout: int = 8) -> list[str]:
        try:
            return sorted(p.name for p in Path(path).iterdir() if p.is_file())
        except Exception:
            return []


class SshRunner:
    """Runs the same `hermes` calls and file reads over SSH (key-based, read-only)."""

    def __init__(self, instance):
        self.i = instance

    def _ssh(self, remote_cmd: str, timeout: int) -> RunResult:
        base = [
            "ssh", "-i", self.i.ssh_key,
            "-o", "BatchMode=yes",
            "-o", f"ConnectTimeout={timeout}",
            self.i.ssh,
        ]
        return _exec(base + [remote_cmd], timeout + 5)

    def run(self, args: list[str], timeout: int = 8) -> RunResult:
        remote = " ".join(shlex.quote(x) for x in [self.i.hermes_bin, "-p", self.i.profile, *args])
        return self._ssh(remote, timeout)

    def read(self, path: str, timeout: int = 8) -> Optional[str]:
        r = self._ssh(f"cat {shlex.quote(path)}", timeout)
        return r.stdout if r.ok else None

    def read_bytes(self, path: str, timeout: int = 8) -> Optional[bytes]:
        # base64 over the wire keeps it byte-exact (R1) regardless of text-mode quirks.
        r = self._ssh(f"base64 {shlex.quote(path)}", timeout)
        if not r.ok:
            return None
        import base64
        try:
            return base64.b64decode(r.stdout)
        except Exception:
            return None

    def write_file(self, path: str, content: bytes, *, exclusive: bool = False, timeout: int = 20) -> WriteResult:
        q = shlex.quote(path)
        guard = f"if [ -e {q} ]; then exit 9; fi; " if exclusive else ""
        remote = (
            f"set -eu; {guard}"
            f'd=$(dirname {q}); t="$d/.argus.$$.tmp"; cat > "$t"; mv -f "$t" {q}'
        )
        base = [
            "ssh", "-i", self.i.ssh_key, "-o", "BatchMode=yes",
            "-o", f"ConnectTimeout={timeout}", self.i.ssh, remote,
        ]
        r = _exec_in(base, timeout + 10, content)   # stdin = raw bytes, no translation
        if r.ok:
            return WriteResult(ok=True, bytes_written=len(content))
        return WriteResult(ok=False, error=(r.stderr or "ssh write failed").strip()[:200])

    def exists(self, path: str, timeout: int = 8) -> bool:
        r = self._ssh(f"test -e {shlex.quote(path)} && echo 1", timeout)
        return r.ok and "1" in r.stdout

    def list_dir(self, path: str, timeout: int = 8) -> list[str]:
        r = self._ssh(f"ls -1 {shlex.quote(path)}", timeout)
        if not r.ok:
            return []
        return [x.strip() for x in r.stdout.splitlines() if x.strip()]


def make_runner(instance) -> Runner:
    return SshRunner(instance) if instance.transport == "ssh" else LocalRunner(instance)
