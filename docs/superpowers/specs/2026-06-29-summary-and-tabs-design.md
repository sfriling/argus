---
title: Argus — Summary Page + Tabbed Navigation + Polish
date: 2026-06-29
status: approved
tags: [argus, ui, frontend, design]
---

# Argus — Summary Page + Tabs + Polish

## Goal
The single-scroll dashboard now stacks eight panels — too much at once. Break it into a
**Summary** landing page (health · live activity · alerts) plus three detail tabs, with a
round of visual polish. Pure frontend change: all data already arrives via the one
`/api/overview` poll, so tabs just present subsets.

## Navigation
A top tab bar under the ARGUS header: **Summary · Fleet · Agents · Insights**. Summary is
the default. The Settings gear stays top-right. `App` holds `activeTab` state and renders
the active view. Tab bar is sticky with the header.

Tab → panels:
- **Summary** — new SummaryView (below).
- **Fleet** — FleetPanel + ProfilesPanel + CronsPanel.
- **Agents** — ClaudeAgentsPanel + DelegationPanel.
- **Insights** — UsagePanel + SessionsPanel + ReliabilityPanel.

## Summary page
Sections, all derived from the existing `Overview` data:
1. **Attention strip** — the "does anything need me?" line. Green "All systems nominal"
   when calm; amber/red with specifics when any: instance unreachable, gateway down,
   dispatcher down, a kanban task `blocked`, or a reliability loop-break today. Driven by
   a pure `deriveAlerts(overview)` helper returning `{level, messages[]}`.
2. **Fleet** — one compact health card per instance: status dot, gateway ✓/✗,
   dispatcher ✓/✗, active profile, in-flight task count.
3. **Live Now** — three cards: Claude agents (active count + the active one's name),
   Kanban (in-flight count + first task), Crons (next-due name/relative time). Each links
   to its tab.
4. **Today** — stat tiles: reliability catches, loop-breaks, total tokens (7-day), session
   count. Aggregated across instances.

## Visual polish
- `Tabs` nav component with active-state styling + a small icon per tab; sticky.
- A shared `Card` primitive (consistent radius/border/padding + hover) adopted by the new
  summary cards; existing panels keep their look but align to the same tokens.
- Consistent status palette helper (green up / amber warn / red down) reused by the strip,
  fleet cards, and badges. Tidy empty states.
- Same calm dark aesthetic — refinement, not a reskin.

## Components (new)
- `frontend/src/nav/Tabs.tsx` — presentational tab bar (`tabs`, `active`, `onSelect`).
- `frontend/src/summary/SummaryView.tsx` — the summary page (+ small `HealthCard`,
  `LiveCard`, `StatTile` locals or shared).
- `frontend/src/summary/alerts.ts` — `deriveAlerts(overview)` pure helper.
- `frontend/src/ui/Card.tsx` — shared card primitive.
- `App.tsx` — tab state + view switch; onSelect from summary cards jumps to a tab.

## Testing
- `alerts.ts`: nominal (no instances degraded) → green; gateway down / unreachable /
  blocked kanban / loop-break-today → amber/red with the right message. (vitest, pure.)
- `Tabs`: renders all tabs, marks active, calls onSelect.
- `SummaryView`: renders fleet health, live-now counts, today tiles from sample data;
  shows the nominal strip for the healthy sample and an alert for the degraded sample.
- `App`: default shows Summary; clicking a tab shows that group's panel; a summary card
  click navigates to its tab.
- Existing panel tests unchanged. Backend untouched. Frontend suite stays green.

## Out of scope (YAGNI)
- Routing/URL per tab (in-memory state is enough for a localhost dashboard).
- Per-tab data lazy-loading (one poll already has everything).
- Drag-to-reorder, user-customizable layouts.
