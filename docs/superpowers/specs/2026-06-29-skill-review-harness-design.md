---
title: Argus — Skill Review Harness (v1, propose-only)
date: 2026-06-29
status: approved
tags: [argus, skill-review, claude, anthropic, opt-in, design]
---

# Argus — Skill Review Harness (v1)

A Claude-powered review loop, opt-in and fully gated. It triages the Hermes sessions that
*struggled*, has Claude review them against the relevant skills, and surfaces **proposals**
(gaps · skill-health findings · concrete suggested edits) in Argus. **Propose-only — no
write-back to skill files in v1.** Off by default; invisible and inert for users without Claude.

## Gating (the "off for non-Claude users" requirement)
- Config: `enable_skill_review: bool = False`, `skill_review_model: str = "claude-opus-4-8"`.
- Key: `ANTHROPIC_API_KEY` from env (preferred) or `anthropic_api_key` config field.
- `skill_review_available(config, bind_host, has_key)` = `enable_skill_review AND localhost AND
  has_key`. Surfaced as `Overview.features.skill_review` so the **Review tab only appears** when
  available. Endpoints 403 otherwise. The key never reaches the frontend.
- `anthropic` is an **optional dependency** (`pip install -e .[review]`); core install never
  pulls it. The backend imports it lazily inside the review path.

## Flow (on-demand: the user clicks "Run review")
1. **Triage** (pure, deterministic, no LLM) — `triage(trajectory_events, sessions, limit=5)`:
   rank by struggle signal = reliability-trajectory events for that session (loop-breaks
   weighted highest, then rejections, then inferences); fill remaining slots with the most
   recent sessions; cap at `limit`. Returns session ids.
2. **Assemble** — for each triaged session, `sessions export --session-id <id> -` → a condensed
   transcript (roles · tool calls · tool errors, truncated); plus the custom (local-source)
   `SKILL.md` contents and the full skill-name list. All over the instance's runner (local/SSH).
   Bounded to a token budget.
3. **Review** — `review(context, model, key)` calls Claude via the `anthropic` SDK with a forced
   structured-output tool (`submit_review`) whose `input_schema` mirrors `ReviewReport`. Returns
   validated proposals.
4. **Drift readout** (deterministic, no LLM) — `skill_drift(instances)`: diff the custom
   skill-name sets across instances → flags the local-vs-VPS divergence for free.

## Contract (`models.py`)
```
SkillGap:     title, evidence, recommendation, target_skill ("<name>" | "new"), suggested_edit
SkillHealth:  skill, finding, severity ("info"|"warn")
DriftItem:    concern, detail
ReviewReport: generated_at, instance, model, sessions_reviewed: [str],
              summary, gaps: [SkillGap], health: [SkillHealth], drift: [DriftItem]
Overview.features: { skill_review: bool }
```

## Endpoints (`app.py`)
- `POST /api/skill-review/{instance}/run` → triage → assemble → review → cache + return
  `ReviewReport`. **403** unless available; **400** on an Anthropic/SDK error (surfaced, never
  crashes the server).
- `GET /api/skill-review/report` → the last cached report (or null). So a refresh doesn't re-spend.
- Drift is computed in `run` (cross-instance) and included in the report.

## Frontend
- `nav/Tabs.tsx` takes a `tabs` prop (the visible set); `App` appends the **Review** tab only when
  `data.features.skill_review`. `review/ReviewTab.tsx`: instance picker · "Run review" (with a
  one-line cost note + spinner) · the report — **Gaps** (evidence + recommendation + the suggested
  edit in a code block), **Skill health**, **Drift** — each section calm and expandable. Caches via
  `GET …/report` on mount so you see the last run without re-spending.

## Testing
- `triage()`: strugglers (trajectory) ranked above recent; respects `limit`; works with no
  trajectory (recent-only).
- `skill_drift()`: divergent skill sets → a drift item; identical → none.
- Proposal parse/validate: a sample `submit_review` tool input → `ReviewReport`; malformed → error.
- Endpoint gating: 403 when disabled / no key / non-localhost; 200 with a **mocked** Anthropic
  client returning a fixed tool input (the live call is not unit-tested).
- Frontend: ReviewTab renders a sample report (gaps/health/drift); the tab is hidden when
  `features.skill_review` is false. Both suites stay green.

## Out of scope (v2, logged)
Write-back/apply to `SKILL.md` files (local + SSH), scheduling/automation, a persistent
multi-run ledger, cross-instance skill *merge* suggestions beyond the name-diff, prompt-caching
the skills corpus.
