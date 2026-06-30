"""Skill write-back engine (V2). Resolves a gap's target SKILL.md (profile-aware, allowlisted),
has Claude produce a COMPLETE revised file, diffs it, scans it, and applies it — byte-exact,
SHA-guarded, per-path-locked, with a backup outside the synced tree. The hard requirements
R1-R13 from the spec live here. `anthropic` stays a lazy import."""
from __future__ import annotations

import difflib
import hashlib
import re
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from backend.models import ApplyOutcome, SkillGap
from backend.skill_review import _default_cli_run, skills_root_for

# --- name / path resolution (R5) --------------------------------------------

_NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_BEGIN = "<<<ARGUS_FILE_BEGIN>>>"
_END = "<<<ARGUS_FILE_END>>>"
MAX_FILE_CHARS = 40_000          # writeback refuses files larger than this (R2)


def sha256(b: bytes) -> str:
    return hashlib.sha256(b or b"").hexdigest()


def valid_skill_name(name: str) -> bool:
    return bool(_NAME_RE.match(name or ""))


def resolve_skill_path(runner, instance, name: str, all_names: list[str]) -> Optional[str]:
    """Resolve a skill NAME to its SKILL.md path under the active profile's skills root.
    R5: reject bad names, require membership in the live skills list, and assert containment."""
    if not valid_skill_name(name) or name not in set(all_names):
        return None
    root = skills_root_for(instance).rstrip("/\\")
    for cat in _candidate_categories(runner, root, name):
        cand = f"{root}/{cat}/{name}/SKILL.md" if cat else f"{root}/{name}/SKILL.md"
        if not _contained(cand, root):
            continue
        if runner.exists(cand):
            return cand
    return None


def new_skill_path(instance, name: str, category: str = "local") -> Optional[str]:
    if not valid_skill_name(name):
        return None
    root = skills_root_for(instance).rstrip("/\\")
    cand = f"{root}/{category}/{name}/SKILL.md"
    return cand if _contained(cand, root) else None


def _candidate_categories(runner, root: str, name: str):
    # try the categorized location first (parsed from the table), then the flat root.
    cats = []
    r = runner.run(["skills", "list"], timeout=15)
    for line in (r.stdout or "").splitlines():
        cells = [c.strip() for c in re.split(r"[│|]", line) if c.strip()]
        if cells and cells[0] == name and len(cells) > 1:
            cats.append(cells[1])
    cats.append("")
    return cats


def _contained(path: str, root: str) -> bool:
    """R5: the resolved path must stay under root and end in SKILL.md (no traversal)."""
    norm = path.replace("\\", "/")
    root_n = root.replace("\\", "/").rstrip("/")
    return norm.startswith(root_n + "/") and ".." not in norm and norm.endswith("/SKILL.md")


# --- diff / sanity / injection ----------------------------------------------

def compute_diff(old: str, new: str, path: str) -> str:
    a = old.splitlines(keepends=True)
    b = new.splitlines(keepends=True)
    return "".join(difflib.unified_diff(a, b, fromfile=f"a/{path}", tofile=f"b/{path}"))


def sanity_check(old: str, new: str) -> list[str]:
    """Hard fails raise ValueError; soft concerns are returned as warnings."""
    if not new.strip():
        raise ValueError("rewrite produced an empty file")
    if old.lstrip().startswith("---") and not new.lstrip().startswith("---"):
        raise ValueError("rewrite dropped the YAML frontmatter")
    om = re.search(r"^name:\s*(.+)$", old, re.M)
    nm = re.search(r"^name:\s*(.+)$", new, re.M)
    if om and nm and om.group(1).strip() != nm.group(1).strip():
        raise ValueError("rewrite changed the skill's frontmatter name")
    warnings: list[str] = []
    if len(new) < len(old) * 0.5:
        warnings.append(f"new file is {round(100 * len(new) / max(len(old), 1))}% of the original size")
    return warnings


_INJECT_PATTERNS = [
    (re.compile(r"\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash)\b"), "pipe-to-shell"),
    (re.compile(r"^\s*```(bash|sh|shell|zsh)\b", re.M), "new shell code block"),
    (re.compile(r"https?://", re.I), "new URL"),
    (re.compile(r"^\s*(allowed-tools|command|hooks|exec)\s*:", re.M | re.I), "new frontmatter exec key"),
    (re.compile(r"(api[_-]?key|secret|token|password)\s*[:=]\s*\S{8,}", re.I), "secret-shaped string"),
]


def injection_scan(old: str, new: str) -> list[str]:
    """R6: flag risky content that the rewrite ADDED (skills are executed by the agent)."""
    old_lines = set(old.splitlines())
    added = "\n".join(ln for ln in new.splitlines() if ln not in old_lines)
    flags: list[str] = []
    for rx, label in _INJECT_PATTERNS:
        if rx.search(added):
            flags.append(label)
    return flags


# --- the rewrite call (R2 truncation, R3 sentinel) --------------------------

REWRITE_SYSTEM = (
    "You revise a single Hermes SKILL.md file. Apply ONLY the change described by the gap; "
    "preserve everything else byte-for-byte (frontmatter, headings, examples, code blocks). "
    "Do not summarize or shorten unrelated sections. Return the COMPLETE revised file."
)

REWRITE_TOOL = {
    "name": "submit_rewrite",
    "description": "Submit the complete revised SKILL.md file.",
    "input_schema": {
        "type": "object",
        "properties": {
            "new_content": {"type": "string", "description": "the ENTIRE revised file"},
            "change_note": {"type": "string", "description": "one line: what changed"},
        },
        "required": ["new_content"],
    },
}


def _gap_brief(gap: SkillGap) -> str:
    return (f"Gap: {gap.title}\nRecommendation: {gap.recommendation}\n"
            f"Suggested edit:\n{gap.suggested_edit}\nEvidence: {gap.evidence}")


def build_rewrite_cli_prompt(full_text: str, gap: SkillGap) -> str:
    return (
        f"{REWRITE_SYSTEM}\n\n{_gap_brief(gap)}\n\n"
        f"Output ONLY the complete revised file between these exact sentinels, nothing else:\n"
        f"{_BEGIN}\n<the entire file>\n{_END}\n\n"
        f"Current file:\n{_BEGIN}\n{full_text}\n{_END}\n"
    )


def _est_tokens(text: str) -> int:
    return max(256, int(len(text) / 3.5) + 512)


def rewrite_skill(full_text: str, gap: SkillGap, model: str, api_key: str,
                  claude_bin: str = "claude", client: Optional[Any] = None,
                  run=_default_cli_run) -> tuple[str, str]:
    """Return (new_content, change_note). R2: reject truncation. R3: sentinel-extract on CLI."""
    if len(full_text) > MAX_FILE_CHARS:
        raise ValueError(f"file too large for writeback ({len(full_text)} > {MAX_FILE_CHARS} chars)")
    if client is not None or api_key:
        return _rewrite_via_api(full_text, gap, model, api_key, client)
    return _rewrite_via_cli(full_text, gap, model, claude_bin, run)


def _rewrite_via_api(full_text: str, gap: SkillGap, model: str, api_key: str,
                     client: Optional[Any]) -> tuple[str, str]:
    if client is None:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
    max_tokens = min(8192, _est_tokens(full_text) + 1024)
    resp = client.messages.create(
        model=model, max_tokens=max_tokens, system=REWRITE_SYSTEM,
        messages=[{"role": "user", "content": _gap_brief(gap) + "\n\nCurrent file:\n" + full_text}],
        tools=[REWRITE_TOOL], tool_choice={"type": "tool", "name": "submit_rewrite"},
    )
    if getattr(resp, "stop_reason", None) == "max_tokens":
        raise ValueError("rewrite hit max_tokens — file truncated; not safe to apply")
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "submit_rewrite":
            data = block.input if isinstance(block.input, dict) else {}
            content = str(data.get("new_content") or "")
            if not content:
                raise ValueError("rewrite returned empty content")
            return content, str(data.get("change_note") or "")
    raise ValueError("model did not return a rewrite")


def _rewrite_via_cli(full_text: str, gap: SkillGap, model: str, claude_bin: str, run) -> tuple[str, str]:
    import json
    stdout = run(claude_bin, model, build_rewrite_cli_prompt(full_text, gap))
    text = str(json.loads(stdout).get("result") or "")
    i, j = text.find(_BEGIN), text.rfind(_END)
    if i == -1 or j == -1 or j <= i:
        raise ValueError("rewrite missing sentinels — refusing to guess file boundaries")
    return text[i + len(_BEGIN):j].strip("\n") + "\n", ""


# --- apply (R1, R4, R7, R8, R9) ---------------------------------------------

_PATH_LOCKS_GUARD = threading.Lock()
_PATH_LOCKS: dict[str, threading.Lock] = {}


def _path_lock(path: str) -> threading.Lock:
    with _PATH_LOCKS_GUARD:
        return _PATH_LOCKS.setdefault(path, threading.Lock())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def apply_edit(runner, gap_index: int, path: str, expected_sha: str, new_bytes: bytes,
               *, is_new: bool, save_backup) -> ApplyOutcome:
    """Apply a rewrite. R9: the whole re-read→check→write is under a per-path lock so the
    optimistic SHA check and the rename are one atomic step. `save_backup(cur_bytes)->str`
    persists the prior file OUTSIDE the synced tree (R8) and returns its path."""
    with _path_lock(path):
        cur = runner.read_bytes(path)
        if is_new:
            if cur is not None:
                return ApplyOutcome(gap_index=gap_index, status="conflict", path=path,
                                    error="skill already exists")
            backup_path = ""
        else:
            cur_sha = sha256(cur) if cur is not None else ""
            if expected_sha and cur_sha != expected_sha:
                return ApplyOutcome(gap_index=gap_index, status="conflict", path=path,
                                    error="file changed since the diff was shown — re-propose")
            backup_path = save_backup(cur or b"")          # R8
        wr = runner.write_file(path, new_bytes, exclusive=is_new)
        if not wr.ok:
            return ApplyOutcome(gap_index=gap_index, status="failed", path=path,
                                backup_path=backup_path, error=wr.error or "write failed")
        after = runner.read_bytes(path)                    # R1 read-back verify
        new_sha = sha256(new_bytes)
        if after is None or sha256(after) != new_sha:
            return ApplyOutcome(gap_index=gap_index, status="failed", path=path,
                                backup_path=backup_path, new_sha256=new_sha,
                                error="read-back mismatch after write")
        return ApplyOutcome(gap_index=gap_index, status="applied", path=path,
                            backup_path=backup_path, new_sha256=new_sha, applied_at=_now_iso())
