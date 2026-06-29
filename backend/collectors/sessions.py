from __future__ import annotations

from backend.models import Session

# `hermes sessions list` prints a fixed-width table:
#   Title                  Preview                  Last Active   ID
#   ─────────────────────────────────────────────────────────────────
#   Obsidian Vault ...     in my obsidian vault     just now      20260629_093238_06533f
# Titles and previews contain spaces, so we slice by the header's column offsets
# rather than splitting on whitespace. The ID column is the stable key.

_HEADERS = ("Title", "Preview", "Last Active", "ID")


def collect_sessions(runner, instance, limit: int = 8) -> list[Session]:
    r = runner.run(["sessions", "list", "--limit", str(limit)])
    return parse_sessions(r.stdout or "", limit=limit)


def _is_rule(line: str) -> bool:
    s = line.strip()
    return bool(s) and set(s) <= set("─-—")


def parse_sessions(text: str | None, limit: int = 8) -> list[Session]:
    if not text or not text.strip():
        return []
    lines = text.splitlines()

    header_idx = None
    for i, line in enumerate(lines):
        if "Title" in line and "ID" in line and "Last Active" in line:
            header_idx = i
            break
    if header_idx is None:
        return []

    header = lines[header_idx]
    cols = [header.index(h) for h in _HEADERS]  # start offset of each column

    def slice_cols(row: str) -> list[str]:
        parts = []
        for j, start in enumerate(cols):
            end = cols[j + 1] if j + 1 < len(cols) else len(row)
            parts.append(row[start:end].strip())
        return parts

    sessions: list[Session] = []
    for line in lines[header_idx + 1:]:
        if _is_rule(line) or not line.strip():
            continue
        title, preview, last_active, sid = slice_cols(line)
        if not sid:
            continue
        sessions.append(
            Session(
                id=sid,
                title="" if title in ("", "—") else title,
                preview=preview,
                last_active=last_active,
            )
        )
        if len(sessions) >= limit:
            break
    return sessions
