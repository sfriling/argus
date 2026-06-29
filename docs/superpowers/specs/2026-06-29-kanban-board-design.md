---
title: Argus — Interactive Kanban Board
date: 2026-06-29
status: approved
tags: [argus, kanban, write-actions, frontend, design]
---

# Argus — Interactive Kanban Board

## Goal
A calm, cross-machine, **interactive** kanban board in Argus: see tasks, add them, move
them, comment, assign. Hermes already owns the engine (durable SQLite board + a complete
`hermes kanban` CLI + its own dashboard plugin), so Argus does NOT reimplement task logic —
it reads via `kanban list/show --json` and writes via the `hermes kanban` CLI over its
existing local+SSH transport. This is Argus's first operational write surface.

## Scope decisions (from brainstorming)
- **Build in Argus** (CLI-backed), not reuse the per-instance Hermes dashboard.
- **Drag-drop + per-card buttons** for interaction.
- New **Board** tab with an instance selector. Default board per instance (multi-board later).

## Backend
- `AppConfig.enable_actions: bool = False` (default off). Guard
  `actions_writable(config, bind_host) = enable_actions AND localhost` (mirrors
  `config_writable`). Single source, unit-tested.
- `GET /api/kanban/{instance}/board` → `{ tasks: [...] }` from `kanban list --json` for that
  instance (runner resolved by name from config). Read-only, always available.
- `GET /api/kanban/{instance}/task/{id}` → `kanban show {id} --json` (body, comments, events).
- `POST /api/kanban/{instance}/action` `{ verb, task_id?, args }` → maps to
  `runner.run(["kanban", verb, ...])`. **403** unless `actions_writable`. **422** on an
  unknown verb. Verb allowlist (the human verbs only):
  - `create` (args: title, body?, assignee?) — `kanban create <title> [--body --assignee]`
  - `comment` (task_id, args.body) — `kanban comment <id> <body>`
  - `assign` (task_id, args.assignee) — `kanban assign <id> <assignee>`
  - `promote` | `block` | `unblock` | `complete` | `archive` (task_id) —
    `kanban <verb> <id>`
  Agent-only verbs (dispatch/decompose/swarm/claim/reclaim) are NOT exposed.
- A `verb_to_argv(verb, task_id, args)` pure helper returns the CLI arg list or raises for
  an unknown/invalid verb — the unit-test seam.

## Frontend
- New tab `board` (TabKey). `BoardTab` fetches `/api/kanban/{instance}/board` on mount +
  instance change + after each action (and a light poll); has an **instance selector**.
- **Columns** (fixed): Todo · Ready · Running · Blocked · Review · Done. Status→column map:
  triage→Todo, todo→Todo, ready→Ready, scheduled→Ready, running→Running, blocked→Blocked,
  review→Review, done→Done, archived→hidden.
- **Drag** (native HTML5 draggable): drop target → verb by destination column:
  - Ready: `unblock` if from blocked/scheduled else `promote`
  - Blocked: `block`
  - Done: `complete`
  - Running / Todo / Review: rejected client-side ("the dispatcher handles that" toast)
  The CLI is the source of truth — if a fired verb errors, surface the error toast; don't
  re-encode every transition rule client-side.
- **TaskCard**: title, assignee, status hint, comment count. **TaskDrawer** (click a card):
  body + comments/events + buttons **Comment · Assign · Archive** (Archive confirms).
- **AddTaskModal**: title, body, assignee (profile dropdown from the instance's profiles).
- **Read-only fallback**: when `actions_writable` is false (meta from the board response),
  cards aren't draggable, buttons/add are disabled with a "set enable_actions: true (localhost)
  to act" hint. Board still fully viewable.
- The Summary page's Live Now keeps the kanban teaser; the old read-only Delegation panel is
  superseded by the Board tab (Delegation panel removed from the Agents tab).

## Write-safety posture
Same as Settings: opt-in flag + localhost-bound + confirm on the irreversible action
(Archive). Low-risk verbs (create/comment/promote/block/unblock/assign) fire immediately with
optimistic update + refetch. Complete is non-destructive (reversible via the agent) — no
confirm. Keep Argus bound to localhost when `enable_actions` is on.

## Testing
- Backend: `verb_to_argv` (each verb → argv; unknown verb raises); `actions_writable` truth
  table; `POST action` 403 (disabled), 422 (bad verb), 200 (happy, calls runner); board read
  parse.
- Frontend: status→column mapping + drag verb resolution (pure); BoardTab renders columns
  from sample tasks; read-only mode disables interaction; AddTaskModal/TaskDrawer render.
- Existing suites stay green.

## Out of scope (YAGNI)
- Multi-board selector (default board only); board create/rename/delete.
- Dependency-link editing in the UI (link/unlink stay CLI).
- Agent ops (dispatch/decompose/swarm). Real-time WS (polling is fine).
