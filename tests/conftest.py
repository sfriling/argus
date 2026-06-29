from __future__ import annotations

from backend.config import Instance
from backend.transport import RunResult


class FakeRunner:
    """In-memory Runner for collector/aggregator tests. `raise_on` simulates a dead transport."""

    def __init__(self, runs=None, files=None, dirs=None, exist=None, raise_on=None):
        self.runs = runs or {}          # tuple(args) -> RunResult
        self.files = files or {}        # path -> text
        self.dirs = dirs or {}          # path -> [names]
        self.exist = set(exist or [])   # existing paths
        self.raise_on = raise_on        # str => every call raises (offline)

    def run(self, args, timeout=8):
        if self.raise_on:
            raise RuntimeError(self.raise_on)
        return self.runs.get(tuple(args), RunResult(ok=False))

    def read(self, path, timeout=8):
        if self.raise_on:
            raise RuntimeError(self.raise_on)
        return self.files.get(path)

    def exists(self, path, timeout=8):
        if self.raise_on:
            raise RuntimeError(self.raise_on)
        return path in self.exist

    def list_dir(self, path, timeout=8):
        if self.raise_on:
            raise RuntimeError(self.raise_on)
        return self.dirs.get(path, [])


def make_instance(name="local", transport="local", home="/home/x/.hermes"):
    extra = {}
    if transport == "ssh":
        extra = {"ssh": "user@host", "ssh_key": "/k"}
    return Instance(name=name, transport=transport, hermes_home=home, hermes_bin="hermes", **extra)
