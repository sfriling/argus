"""Session drill-down — read one session's transcript via `hermes sessions export`.

`hermes sessions export --session-id <id> -` streams one JSON object (metadata + messages)
to stdout, so it works over the SSH transport too. Read-only."""
from __future__ import annotations

import json
from typing import Optional

from backend.models import SessionDetail, SessionMessage, SessionMeta

_RESULT_MAX = 4000  # cap each tool-result body so a huge file read can't bloat the payload


def collect_session(runner, instance, session_id: str) -> Optional[SessionDetail]:
    r = runner.run(["sessions", "export", "--session-id", session_id, "-"], timeout=20)
    if not r.ok:
        return None
    return parse_session(r.stdout)


def _as_text(content) -> str:
    if isinstance(content, str):
        return content
    if content is None:
        return ""
    try:
        return json.dumps(content, ensure_ascii=False)
    except Exception:
        return str(content)


def _truncate(text: str) -> tuple[str, bool]:
    if len(text) <= _RESULT_MAX:
        return text, False
    return text[:_RESULT_MAX].rstrip() + "…", True


def parse_session(text: str | None) -> Optional[SessionDetail]:
    if not text or not text.strip():
        return None
    try:
        j = json.loads(text)
    except Exception:
        return None
    if not isinstance(j, dict):
        return None

    raw = j.get("messages")
    raw = raw if isinstance(raw, list) else []

    messages: list[SessionMessage] = []
    for m in raw:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "")
        if role == "tool":
            result, trunc = _truncate(_as_text(m.get("content")))
            messages.append(SessionMessage(
                role="tool", tool_name=str(m.get("tool_name") or ""),
                result=result, truncated=trunc,
            ))
        else:
            tool_calls = m.get("tool_calls") or []
            tools = [
                str((tc.get("function") or {}).get("name"))
                for tc in tool_calls
                if isinstance(tc, dict) and (tc.get("function") or {}).get("name")
            ]
            messages.append(SessionMessage(role=role or "assistant", text=_as_text(m.get("content")), tools=tools))

    meta = SessionMeta(
        id=str(j.get("id") or ""),
        title=str(j.get("title") or ""),
        model=str(j.get("model") or ""),
        message_count=int(j.get("message_count") or len(raw)),
        tool_call_count=int(j.get("tool_call_count") or 0),
        input_tokens=int(j.get("input_tokens") or 0),
        output_tokens=int(j.get("output_tokens") or 0),
        cost_usd=float(j.get("actual_cost_usd") or j.get("estimated_cost_usd") or 0.0),
        started_at=_as_float(j.get("started_at")),
        ended_at=_as_float(j.get("ended_at")),
        end_reason=str(j.get("end_reason") or ""),
    )
    return SessionDetail(meta=meta, messages=messages)


def _as_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except Exception:
        return None
