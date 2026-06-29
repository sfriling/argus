---
title: Argus — Map tab (visual fleet view) v1
date: 2026-06-29
status: approved
tags: [argus, ui, visualization, frontend, design]
---

# Argus — Map tab (v1)

The approved, buildable v1 of the visual "fleet" view researched in
`2026-06-29-visual-fleet-mode-research.md`. Approach A (SVG node-map), but **pure CSS/SVG
animation — no new dependency**. Purely additive; the text dashboard is untouched.

## Decisions
- **A 6th tab `Map`** (`{ key: 'map', label: 'Map', icon: '◉' }`), **lazy-loaded** (`React.lazy`
  + `Suspense`) so the text experience pays nothing for it.
- **Pure CSS/SVG** animation (CSS `@keyframes` in `fleetmap/fleetmap.css`). No framer-motion.
- **No backend change** — renders the same `Overview` the other tabs poll.

## Components
- `lib/status.ts` — extract the existing `instanceLevel(inst)` helper out of `SummaryView`
  (refactor Summary to import it); reused by the Map.
- `fleetmap/layout.ts` — pure `buildFleetGraph(overview) → { width, height, hubs, agents, edges,
  tokens }`. The test seam (like `deriveAlerts`).
  - **hubs**: one per instance, evenly spaced horizontally; `level` from `instanceLevel`;
    `transport`, kanban `counts`, in-flight count.
  - **agents**: `claude_agents[]` arranged in a ring around the local hub (radius ~130);
    carries `busy`/`blocked`/`live`/`state`/`name`/`task`/`model`/`tokens`.
  - **edges**: faint line local-hub → each agent (structural: "these agents run here").
  - **tokens**: per `kanban.in_flight` task, positioned around its instance hub (radius ~60,
    evenly spaced), colored by `STATUS_COLOR[status]`. (Honest: tasks belong to an instance;
    kanban `assignee` is a Hermes profile, not a Claude-agent node, so tokens orbit the hub
    rather than fake an agent edge.)
- `fleetmap/FleetMap.tsx` — renders one responsive SVG scene (`viewBox`, `width:100%`):
  hubs (ring=level + count badge + label), edges, agent nodes (busy→pulse class,
  blocked→amber halo, idle→dim, done/not-live→parked outline; hover tooltip), task tokens
  (slow orbit group per hub). An **ambient HUD** (static text): active agents · in-flight ·
  next cron (`nextCron`) · 7-day tokens/sessions · today's catches/loop-breaks **only if any
  instance `reliability.configured`**. **Empty state**: a calm idle scene, not blank.
- `fleetmap/fleetmap.css` — `@keyframes` for the breathing pulse and the orbit; a
  `@media (prefers-reduced-motion: reduce)` block that disables them; a `.fleet--stale` class
  that desaturates and freezes animation.

## Behavior
- **Reduced motion**: `prefers-reduced-motion: reduce` → no continuous animation; `busy` still
  reads as a brighter static ring. Handled in CSS (no JS branching needed).
- **Stale**: when `stale` (from `useOverview`), add `.fleet--stale` → desaturate + freeze.
- **Click-through**: agent node → `onNavigate('agents')`; task token / hub → `onNavigate('board')`.
  `App` passes `setTab` down (same pattern as `SummaryView`).

## Testing
- `buildFleetGraph`: hub per instance with correct level; agent nodes count + busy/blocked
  flags; a token per in-flight task; empty overview → empty graph. (pure, no DOM.)
- `FleetMap`: renders a hub label per instance, a node per agent, the empty state, and the HUD
  counts from a sample.
- Existing suites untouched; frontend build (type-check) stays green.

## Out of scope (YAGNI)
Pan/zoom, drag, 3D/canvas, real-time streaming, agent↔instance backend association, animating
past activity. Map is additive and read-only.
