"""Skill Review (v1, propose-only) — triage struggling Hermes sessions, have Claude review them
against the skills, and return proposals. No write-back. The `anthropic` import is lazy so the
core install never needs it."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from typing import Any, Optional

from backend.models import DriftItem, ReviewReport, SkillGap, SkillHealth
from backend.session_detail import parse_session

# --- triage (pure) -----------------------------------------------------------

def _struggle_score(events: list[dict]) -> int:
    s = 0
    for e in events:
        try:
            attempt = int(e.get("attempt") or 0)
        except Exception:
            attempt = 0
        action = e.get("action")
        if attempt >= 2:
            s += 3                 # a loop-break
        elif action == "rejected":
            s += 2
        elif action == "inferred":
            s += 1
    return s


def _sid(s: Any) -> str:
    return str(getattr(s, "id", None) or (s.get("id") if isinstance(s, dict) else "") or "")


def _session_when(sid: str) -> str:
    """Hermes session ids start with YYYYMMDD_HHMMSS — surface the full timestamp so the reviewer
    can decide the 'occurred after the fix?' timing rule even for same-day cases (date-only loses
    the time and makes same-day regressions undecidable)."""
    m = re.match(r"^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})", sid or "")
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4)}:{m.group(5)}:{m.group(6)}"
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", sid or "")
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""


def triage(trajectory_events: list[dict], sessions: list, limit: int = 5,
           reviewed_sids: Optional[set] = None) -> list[str]:
    """Rank sessions by struggle: trajectory strugglers first (loop-breaks > rejections >
    inferences), then fill with the most recent sessions. Sessions already reviewed-and-acted-on
    (in `reviewed_sids`) are nudged down so fresh struggles surface first. Returns up to `limit`
    session ids."""
    reviewed = reviewed_sids or set()
    by_session: dict[str, list[dict]] = defaultdict(list)
    for e in trajectory_events:
        sid = e.get("session_id")
        if sid:
            by_session[str(sid)].append(e)

    # Rank not-yet-acted-on struggles STRICTLY ahead of already-acted-on ones (primary key), then
    # by struggle score (secondary). A flat penalty wasn't enough: persistent heavy strugglers that
    # were already fixed would keep filling all the slots and crowd out a fresh regression. Acted-on
    # sessions still appear (after the fresh ones) so a genuine recurrence is never hard-excluded.
    def _key(sid: str, evs: list[dict]):
        return (1 if sid in reviewed else 0, -_struggle_score(evs))

    scored = sorted(by_session.items(), key=lambda kv: _key(kv[0], kv[1]))
    ordered = [sid for sid, evs in scored if _struggle_score(evs) > 0]
    seen = set(ordered)
    for s in sessions:
        sid = _sid(s)
        if len(ordered) >= limit:
            break
        if sid and sid not in seen:
            ordered.append(sid)
            seen.add(sid)
    return ordered[:limit]


# --- drift (pure) ------------------------------------------------------------

def skill_drift(per_instance_custom: dict[str, set[str]]) -> list[DriftItem]:
    """Flag custom skills that exist on one instance but not another (fleet drift)."""
    if len(per_instance_custom) < 2:
        return []
    names = list(per_instance_custom)
    union: set[str] = set().union(*per_instance_custom.values())
    out: list[DriftItem] = []
    for skill in sorted(union):
        have = [n for n in names if skill in per_instance_custom[n]]
        if len(have) != len(names):
            missing = [n for n in names if n not in have]
            out.append(DriftItem(
                concern=f"'{skill}' is not on every instance",
                detail=f"present on {', '.join(have)}; missing on {', '.join(missing)}",
            ))
    return out


# --- gather skills + assemble context ---------------------------------------

def read_trajectory(runner, instance) -> list[dict]:
    """Read the reliability trajectory log (the struggle signal), if present."""
    path = getattr(instance, "reliability_log", None)
    if not path:
        path = instance.hermes_home.rstrip("/\\") + "/reliability/trajectories.jsonl"
    text = runner.read(path)
    events: list[dict] = []
    for ln in (text or "").splitlines():
        if not ln.strip():
            continue
        try:
            e = json.loads(ln)
        except Exception:
            continue
        if isinstance(e, dict):
            events.append(e)
    return events


def skills_root_for(instance) -> str:
    """The skills dir the active profile actually reads. A Hermes profile is its own
    HERMES_HOME (`<root>/profiles/<name>`), so a `-p <profile>` session reads
    `<root>/profiles/<profile>/skills` — NOT `<root>/skills` (the *default* profile).
    gather_skills lists `-p <profile>` skills, so it must read that same tree."""
    home = instance.hermes_home.rstrip("/\\")
    prof = (getattr(instance, "profile", "") or "").strip()
    if prof and prof != "default":
        return f"{home}/profiles/{prof}/skills"
    return f"{home}/skills"


def gather_skills(runner, instance, max_custom: int = 8) -> tuple[dict[str, str], list[str], set[str]]:
    """Return ({custom_name: SKILL.md content}, all_skill_names, custom_name_set) for an instance.
    Reads the SKILL.md files directly (`skills inspect` is slow/network-bound and times out)."""
    r = runner.run(["skills", "list"], timeout=15)
    names: list[str] = []
    custom: list[tuple[str, str]] = []   # (name, category)
    for line in (r.stdout or "").splitlines():
        if "│" not in line and "|" not in line:
            continue
        cells = [c.strip() for c in re.split(r"[│|]", line) if c.strip()]
        if not cells:
            continue
        name = cells[0]
        if not name or name.lower() == "name" or set(name) <= set("─-= "):
            continue
        names.append(name)
        if any(c.lower() == "local" for c in cells):
            custom.append((name, cells[1] if len(cells) > 1 else ""))

    skills_root = skills_root_for(instance)
    contents: dict[str, str] = {}
    for name, category in custom[:max_custom]:
        # name may be truncated in the table (…); only read clean names
        if "…" in name or "..." in name:
            continue
        for path in ([f"{skills_root}/{category}/{name}/SKILL.md"] if category else []) + [
            f"{skills_root}/{name}/SKILL.md"
        ]:
            text = runner.read(path)
            if text:
                contents[name] = text[:3000]
                break
    return contents, names, {n for n, _ in custom}


def gather_memory(runner, instance, max_profiles: int = 6, cap: int = 2500) -> dict[str, str]:
    """Per-profile MEMORY.md for this instance. Memory is intentionally NOT synced across
    machines (file paths differ), so this is always read per-instance via its own runner."""
    home = instance.hermes_home.rstrip("/\\")
    out: dict[str, str] = {}
    for p in (runner.list_dir(f"{home}/profiles") or [])[:max_profiles]:
        text = runner.read(f"{home}/profiles/{p}/memories/MEMORY.md")
        if text and text.strip():
            out[p] = text[:cap]
    return out


def _condense_transcript(export_text: str, max_chars: int = 3500) -> str:
    """A compact, struggle-focused view: title + tool calls + tool ERRORS (the loop evidence),
    with prose kept brief. Tool errors matter most, so they're never dropped first."""
    d = parse_session(export_text)
    if not d:
        return "(could not parse)"
    lines = [f"[meta] title={d.meta.title!r} {d.meta.tool_call_count} tool calls, "
             f"{d.meta.message_count} msgs, end={d.meta.end_reason or '—'}"]
    for m in d.messages:
        if m.role == "tool":
            if '"error"' in m.result.lower():
                lines.append(f"  -> ERROR from {m.tool_name}: {m.result[:140]}")
        elif m.tools:
            lines.append(f"assistant calls: {', '.join(m.tools)}")
        elif m.text:
            lines.append(f"{m.role}: {m.text[:120]}")
    out = "\n".join(lines)
    return out[:max_chars]


def assemble(runner, instance, session_ids: list[str], skills: dict[str, str], all_names: list[str],
             memory: dict[str, str] | None = None, applied: list[dict] | None = None) -> str:
    parts = []
    if applied:
        parts.append("# Already addressed in prior reviews (skill | what was fixed | when applied) "
                     "— see the timing rule in your instructions before re-raising any of these:")
        for a in applied:
            parts.append(f"- {a.get('skill','')} | {a.get('title','')} | "
                         f"{a.get('applied_at','') or '(time unknown)'}")
        parts.append("")
    parts.append("# Hermes sessions that struggled (most → least)")
    for sid in session_ids:
        r = runner.run(["sessions", "export", "--session-id", sid, "-"], timeout=25)
        if r.ok and r.stdout:
            d = _session_when(sid)
            hdr = f"## Session {sid}" + (f" (occurred {d})" if d else " (occurred: unknown)")
            parts.append(f"\n{hdr}\n{_condense_transcript(r.stdout)}")
    parts.append("\n\n# Current custom skills (full content)")
    for name, content in skills.items():
        parts.append(f"\n## SKILL: {name}\n{content}")
    if memory:
        parts.append("\n\n# Profile memory on THIS instance (per profile)\n"
                     "(Memory is per-machine and intentionally NOT synced — file paths differ "
                     "between machines. Do NOT propose syncing memory or flag path differences as drift.)")
        for prof, mem in memory.items():
            parts.append(f"\n## MEMORY [{prof}]\n{mem}")
    parts.append(f"\n\n# All installed skill names\n{', '.join(all_names)}")
    return "\n".join(parts)


# --- Claude review -----------------------------------------------------------

SYSTEM = (
    "You are a senior reviewer improving a Hermes agent. You are given transcripts of sessions "
    "where the agent STRUGGLED, plus the agent's current custom skills AND its per-profile memory "
    "(MEMORY.md). Diagnose the ROOT cause from the evidence (don't guess). Prefer HARDENING an "
    "existing skill over inventing a new one; only propose a new skill for a genuine, unaddressed "
    "gap. For each gap give concrete, minimal suggested edit text. Also flag stale, inaccurate, or "
    "contradictory entries in EITHER the skills OR the memory. Memory is per-machine and "
    "intentionally unsynced (file paths differ between machines) — never suggest syncing memory or "
    "treat path differences as a problem. "
    "You may be given a list of edits ALREADY APPLIED to skills (each with a timestamp), and every "
    "struggling session shows when it occurred. Before raising a gap, check that list: if a prior "
    "edit already addressed the same problem in the same skill, SUPPRESS the gap ONLY when the "
    "struggling session CLEARLY occurred BEFORE that edit (an earlier day, or clearly earlier the "
    "same day). If the session occurred at or after the edit, OR you cannot tell (same time, "
    "missing/ambiguous timestamps, possibly different time zones), treat it as a POSSIBLE "
    "REGRESSION and DO raise it — a redundant proposal is cheap to reject in review, a missed "
    "regression is not. Be precise and evidence-based; cite the session id. Call submit_review "
    "exactly once."
)

REVIEW_TOOL = {
    "name": "submit_review",
    "description": "Submit the skill-review findings.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "2-4 sentence overview."},
            "gaps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "evidence": {"type": "string", "description": "session id + what went wrong"},
                        "recommendation": {"type": "string"},
                        "target_skill": {"type": "string", "description": "an existing skill name to harden, or 'new'"},
                        "suggested_edit": {"type": "string", "description": "the concrete text to add/change"},
                    },
                    "required": ["title", "recommendation", "target_skill"],
                },
            },
            "health": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "skill": {"type": "string"},
                        "finding": {"type": "string"},
                        "severity": {"type": "string", "enum": ["info", "warn"]},
                    },
                    "required": ["skill", "finding"],
                },
            },
        },
        "required": ["summary", "gaps", "health"],
    },
}


def report_from_tool_input(data: dict, instance: str, model: str, sessions: list[str], now_iso: str) -> ReviewReport:
    gaps = [SkillGap(
        title=str(g.get("title") or ""),
        evidence=str(g.get("evidence") or ""),
        recommendation=str(g.get("recommendation") or ""),
        target_skill=str(g.get("target_skill") or ""),
        suggested_edit=str(g.get("suggested_edit") or ""),
    ) for g in (data.get("gaps") or []) if isinstance(g, dict)]
    health = [SkillHealth(
        skill=str(h.get("skill") or ""),
        finding=str(h.get("finding") or ""),
        severity=str(h.get("severity") or "info"),
    ) for h in (data.get("health") or []) if isinstance(h, dict)]
    return ReviewReport(
        generated_at=now_iso, instance=instance, model=model, sessions_reviewed=sessions,
        summary=str(data.get("summary") or ""), gaps=gaps, health=health,
    )


def _review_via_api(context: str, model: str, api_key: str, client: Optional[Any]) -> dict:
    """Anthropic API path — forced structured-output tool. Returns the tool input dict."""
    if client is None:
        import anthropic  # lazy: optional dependency
        client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model, max_tokens=4096, system=SYSTEM,
        messages=[{"role": "user", "content": context}],
        tools=[REVIEW_TOOL], tool_choice={"type": "tool", "name": "submit_review"},
    )
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "submit_review":
            return block.input if isinstance(block.input, dict) else json.loads(block.input)
    raise ValueError("Claude did not return a structured review")


# The CLI can't force tool-use, so we ask for raw JSON matching the same shape.
_JSON_SCHEMA_HINT = (
    'Respond with ONLY a JSON object (no prose, no markdown fences) of the form: '
    '{"summary": str, "gaps": [{"title": str, "evidence": str, "recommendation": str, '
    '"target_skill": "<existing skill name>"|"new", "suggested_edit": str}], '
    '"health": [{"skill": str, "finding": str, "severity": "info"|"warn"}]}.'
)


def build_cli_prompt(context: str) -> str:
    return f"{SYSTEM}\n\n{_JSON_SCHEMA_HINT}\nDo not use any tools; work only from the text below.\n\n{context}"


def parse_cli_result(stdout: str) -> dict:
    """Pull the model's text out of `claude -p --output-format json`, then parse it as the review JSON."""
    outer = json.loads(stdout)
    text = str(outer.get("result") or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    text = text[text.find("{"): text.rfind("}") + 1] if "{" in text else text
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("CLI review did not return a JSON object")
    return data


def _default_cli_run(claude_bin: str, model: str, prompt: str) -> str:
    import shutil
    import subprocess
    # Resolve the real path — on Windows the npm shim is `claude.CMD`, which CreateProcess
    # won't find from the bare name "claude".
    exe = shutil.which(claude_bin) or claude_bin
    no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    p = subprocess.run(
        # --allowed-tools "" → no tools, so the reviewer answers in one shot from the prompt
        # instead of going agentic (reading the files mentioned in the context).
        [exe, "-p", "--output-format", "json", "--model", model, "--allowed-tools", ""],
        input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=420, creationflags=no_window,
    )
    if p.returncode != 0:
        raise ValueError((p.stderr or p.stdout or "claude CLI failed").strip()[:300])
    return p.stdout


def _review_via_cli(context: str, model: str, claude_bin: str, run=_default_cli_run) -> dict:
    """Claude Code CLI path — uses the logged-in subscription auth, no API key. `run` is injectable."""
    return parse_cli_result(run(claude_bin, model, build_cli_prompt(context)))


def review(context: str, model: str, api_key: str, instance: str, sessions: list[str],
           now_iso: str, claude_bin: str = "claude", client: Optional[Any] = None, run=_default_cli_run) -> ReviewReport:
    """Review via the Anthropic API (when an api_key/client is given) or the Claude Code CLI
    (subscription auth) otherwise. Returns a validated ReviewReport."""
    if client is not None or api_key:
        data = _review_via_api(context, model, api_key, client)
    else:
        data = _review_via_cli(context, model, claude_bin, run=run)
    return report_from_tool_input(data, instance, model, sessions, now_iso)
