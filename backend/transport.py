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


class Runner(Protocol):
    def run(self, args: list[str], timeout: int = 8) -> RunResult: ...
    def read(self, path: str, timeout: int = 8) -> Optional[str]: ...
    def exists(self, path: str, timeout: int = 8) -> bool: ...
    def list_dir(self, path: str, timeout: int = 8) -> list[str]: ...


def _exec(cmd: list[str], timeout: int) -> RunResult:
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout,
        )
        return RunResult(ok=(p.returncode == 0), stdout=p.stdout or "", stderr=p.stderr or "")
    except Exception as e:  # timeout, missing binary, etc. — never raise into a collector
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
