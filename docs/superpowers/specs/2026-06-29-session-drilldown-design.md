---
title: Argus — Session Drill-down
date: 2026-06-29
status: approved
tags: [argus, sessions, observability, frontend, design]
---

# Argus — Session Drill-down

## Goal
Click a session in the Recent Sessions panel to see **what it actually did**: a summary header
plus a readable transcript. Read-only (sessions are history), cross-machine (local + VPS via the
existing transport). First step toward making Argus the go-to Hermes *ops* console.

## Data source
`hermes sessions export --session-id <id> -` streams one JSON object to stdout (works over SSH):
rich metadata (title, model, message/tool-call counts, input/output tokens, `estimated_cost_usd`,
`started_at`/`ended_at`, `end_reason`) plus a `messages[]` array. Each message has
`role` (user/assistant/tool), `content`, `tool_calls[].function.name`, and `tool_name` (for tool
results).

## Backend
- New `backend/session_detail.py`:
  - `parse_session(text) -> SessionDetail | None` — pure, the test seam. Normalizes the export.
  - `collect_session(runner, instance, session_id)` — runs the export over the runner; `None` on
    failure.
- Endpoint `GET /api/sessions/{instance}/{session_id}` → resolves the instance, returns
  `SessionDetail`, `404` if the export is missing/unparseable. **No write gate** (read-only).
- **Truncation:** each `tool` result `content` is capped (~4 KB) with a `truncated` flag, so a
  session that read a huge file doesn't bloat the payload. User/assistant text is left whole.

## Contract (pydantic, in models.py)
```
SessionMeta:    id, title, model, message_count, tool_call_count,
                input_tokens, output_tokens, cost_usd,
                started_at (epoch|null), ended_at (epoch|null), end_reason
SessionMessage: role, text="", tools=[], tool_name="", result="", truncated=false
SessionDetail:  meta: SessionMeta, messages: [SessionMessage]
```
- user/assistant → `text` = content, `tools` = names of any tool calls.
- tool → `tool_name` + `result` (truncated), `text` empty.

## Frontend
- `insights/SessionDrawer.tsx` — fetched on open via `insights/api.ts` `fetchSession(instance, id)`.
  - **Header:** model · turns · tools · tokens · cost · outcome (`end_reason`), with started/elapsed.
  - **Transcript:** user/assistant text rendered plainly; an assistant turn's tool calls as compact
    chips; **tool results collapsed**, click a chip/row to expand the (truncated) JSON.
- `panels/SessionsPanel.tsx` becomes stateful: a session row click opens the drawer for that
  `(instance, id)`. Rows already carry the instance (per-instance sections) and the session id.

## Testing
- `parse_session`: meta extraction, message normalization (assistant-tools / tool-result),
  truncation flag, empty/garbage input → None.
- endpoint: `200` with a mocked runner returning an export; `404` on failure / unknown instance.
- frontend: SessionDrawer renders header + transcript from a sample; a SessionsPanel row click
  opens it. Existing suites stay green.

## Out of scope (YAGNI)
- Session search (Hermes has `sessions search` — later), reasoning-trace display, live-follow,
  export-to-file, pagination of very long transcripts (truncate + render all for now).
