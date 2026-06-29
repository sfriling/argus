from __future__ import annotations

import re

from backend.models import Usage, UsageModel, UsageTool

# `hermes insights` prints a formatted box (no JSON mode). We parse by label, not
# by layout, so the two-stats-per-line arrangement doesn't matter. Numbers may carry
# thousands separators ("1,299,215") and tokens columns are right-aligned.


def collect_usage(runner, instance, days: int = 7) -> Usage:
    r = runner.run(["insights", "--days", str(days)])
    return parse_usage(r.stdout or "", days=days)


def _num(text: str, label: str) -> int:
    # Match "Label: 1,299,215" anywhere, tolerant of surrounding whitespace/box chars.
    m = re.search(re.escape(label) + r"\s*:?\s*([\d,]+)", text)
    if not m:
        return 0
    return int(m.group(1).replace(",", ""))


def _section(text: str, header: str) -> list[str]:
    """Return the content lines of a `header`-titled section (between its rule and the next blank/section)."""
    lines = text.splitlines()
    out: list[str] = []
    capturing = False
    seen_rule = False
    for line in lines:
        stripped = line.strip()
        if not capturing:
            if header in line:
                capturing = True
                seen_rule = False
            continue
        # inside the section: first dashed rule is the header underline; stop at the next one
        is_rule = bool(stripped) and set(stripped) <= set("─-—")
        if is_rule:
            if not seen_rule:
                seen_rule = True
                continue
            break  # a second rule means the next section started without a gap
        # stop at a blank line or an emoji/section marker line
        if not stripped:
            if out:
                break
            continue
        if seen_rule:
            out.append(line)
    return out


def _parse_models(text: str) -> list[UsageModel]:
    models: list[UsageModel] = []
    for line in _section(text, "Models Used"):
        # "grok-4.3                             17    5,501,145"
        m = re.match(r"\s*(\S.*?\S)\s{2,}(\d[\d,]*)\s+([\d,]+)\s*$", line)
        if not m:
            continue
        name = m.group(1).strip()
        if name.lower().startswith("model"):  # header row
            continue
        models.append(
            UsageModel(
                name=name,
                sessions=int(m.group(2).replace(",", "")),
                tokens=int(m.group(3).replace(",", "")),
            )
        )
    return models[:5]


def _parse_top_tools(text: str) -> list[UsageTool]:
    tools: list[UsageTool] = []
    for line in _section(text, "Top Tools"):
        # "computer_use                       25    23.6%"
        m = re.match(r"\s*(\S.*?\S)\s{2,}(\d[\d,]*)\s+[\d.]+%\s*$", line)
        if not m:
            continue
        name = m.group(1).strip()
        if name.lower().startswith("tool"):  # header row
            continue
        tools.append(UsageTool(name=name, calls=int(m.group(2).replace(",", ""))))
    return tools[:6]


def _active_time(text: str) -> str:
    m = re.search(r"Active time\s*:?\s*(.+?)\s{2,}", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"Active time\s*:?\s*(.+)$", text, re.MULTILINE)
    return m.group(1).strip() if m else ""


def parse_usage(text: str | None, days: int = 7) -> Usage:
    if not text or not text.strip():
        return Usage(days=days)
    return Usage(
        days=days,
        sessions=_num(text, "Sessions"),
        messages=_num(text, "Messages"),
        tool_calls=_num(text, "Tool calls"),
        input_tokens=_num(text, "Input tokens"),
        output_tokens=_num(text, "Output tokens"),
        total_tokens=_num(text, "Total tokens"),
        active_time=_active_time(text),
        models=_parse_models(text),
        top_tools=_parse_top_tools(text),
    )
