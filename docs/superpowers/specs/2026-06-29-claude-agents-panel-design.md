---
title: Argus — Claude Agents Panel
date: 2026-06-29
status: approved
tags: [argus, claude-code, observability, design]
---

# Argus — Claude Agents Panel

## Goal
Add a **Claude Agents** view to Argus showing this desktop's Claude Code background
agents — **active ones pinned at top, recent/completed below** — each with name,
current task, state, model, token spend, and last activity. Local-only source,
read from `~/.claude/jobs` + `~/.claude/sessions`. This is the Claude-Code analog of
the Hermes fleet view, requested after "Ask Argus" misread the original intent.

## Scope decisions (from brainstorming)
- **What is an agent:** daemon-managed Claude Code background jobs/sessions.
- **Where:** this desktop only — a single local source, no SSH.
- **Primary view:** active now + recent history.
- **Integration:** Approach A — a dedicated top-level concept and panel, the Hermes
  instance model left untouched.

## Data sources
- `~/.claude/jobs/<id>/state.json` — authoritative per-agent state: `state`
  (active/done), `detail` (current task), `tempo`, `inFlight.tasks`, `tokens`,
  `name`, `sessionId`, `cwd`, `createdAt`, `updatedAt`, `respawnFlags`
  (`--model <m>`), `daemonShort`.
- `~/.claude/sessions/<pid>.json` — live process registry: `pid`, `sessionId`,
  `status` (idle/running), `name`, `agent` (== "claude"), `jobId`, `updatedAt`.
- Join `jobs` ⟕ `sessions` on `sessionId` to derive `live` and refine `state`.

## Contract
New pydantic model `ClaudeAgent`:
- `id: str` — jobId / `daemonShort`
- `name: str`
- `task: str` — `detail`, truncated server-side to ~200 chars
- `state: str` — `active` | `idle` | `done`
- `model: str` — parsed from `respawnFlags`
- `tokens: int`
- `in_flight: int` — `inFlight.tasks`
- `cwd: str`
- `session_id: str`
- `created_at: str`, `updated_at: str` — ISO strings as stored
- `live: bool` — a matching `sessions/*.json` entry exists

`Overview` gains `claude_agents: list[ClaudeAgent] = []` (sibling to `instances`).

## Collector — `backend/collectors/claude_agents.py`
- `collect_claude_agents(runner, claude_home, days=7, limit=50) -> list[ClaudeAgent]`
- Reads `jobs/` via `runner.list_dir`, each `state.json` via `runner.read`; reads
  `sessions/*.json` and builds a `sessionId -> {pid,status}` map for the join.
- **Filter:** always include `active`/`live`; include `done` whose `updated_at` is
  within `days`; cap to `limit` most-recent.
- **Sort:** active/live first, then `updated_at` desc.
- Pure helper `parse_claude_agents(job_texts, session_texts, ...)` for testability.
- Fully defensive: bad JSON skipped, missing dirs → `[]`, never raises (matches the
  other collectors' contract).
- Goes through the runner's file ops, so it is SSH-capable for free if multi-machine
  is wanted later — but only the local source is wired now.

## Aggregator / config
- `AppConfig` gains optional `claude_home: str` (default `~/.claude`, `expanduser`'d;
  empty string disables the panel).
- `build_overview` collects `claude_agents` once, locally, via a `LocalRunner`,
  guarded so a failure degrades to `[]` and never breaks the page.

## Panel — `frontend/src/panels/ClaudeAgentsPanel.tsx`
- **Active** agents as cards at top (green pulse dot): name · current task · model
  chip · tokens · cwd basename · "updated Xs ago" · in-flight count.
- A **Recent** divider, then completed/idle agents as slimmer rows with a state badge.
- Hidden entirely when there are no agents. Reuses the existing dark stat-card /
  badge styling. Placed **right after the Fleet panel**.

## Edge cases & testing
- Missing `claude_home` or empty dirs → empty list, panel hidden.
- Token formatting reuses the `formatTokens` helper.
- Backend parse tests: active-first ordering, model parse, done-window filter,
  live-join. Frontend panel tests + sample fixtures, matching existing conventions.
- Targets: backend + frontend suites stay green.

## Out of scope (YAGNI)
- SSH/multi-machine Claude sources (structurally supported, not wired).
- Live OS process probing beyond the recorded `sessions` registry.
- Drilling into full transcripts (`projects/*.jsonl`).
- Any control actions — read-only, like the rest of Argus.
