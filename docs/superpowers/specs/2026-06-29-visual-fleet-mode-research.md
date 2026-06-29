---
title: Argus — Visual "Fleet Mode" Visualization (Research + Design)
date: 2026-06-29
status: research
tags: [argus, ui, frontend, design, visualization, research]
---

# Argus — Visual "Fleet Mode" (Research + Design Proposal)

## 1. Goal & the hard constraint

Argus today is a calm, text-first dashboard (README ethos: *"calm, read-only,
cross-machine"*; *"is the fleet alive, what is it doing right now, does anything need
me?"*). This proposal designs an **optional graphical visualization mode** — a "futuristic
fleet" view where agents are animated nodes that visibly *work*, pulse, and hand off tasks —
so the operator *feels* like they're commanding a fleet rather than reading a table.

**Critical constraint: the text dashboard stays.** This is a **mode/toggle, not a
replacement**. Every existing tab (Summary · Board · Fleet · Agents · Insights) and its data
stay exactly as-is. Fleet Mode is an *additional* way to look at the same snapshot, and the
operator can flip back to plain text at any time. Calm-by-default is preserved: the visual
mode is opt-in and should *itself* stay tasteful (no seizure-inducing motion, respects
`prefers-reduced-motion`).

### Where the toggle lives

Two clean options that fit the existing structure (`App.tsx` holds `tab` state;
`nav/Tabs.tsx` defines `TABS`):

- **(Recommended) A 6th tab.** Add `{ key: 'fleetmap', label: 'Map', icon: '◉' }` to
  `TABS` in `nav/Tabs.tsx` and a `tab === 'fleetmap' && <FleetMap overview={data} />`
  branch in `App.tsx`. Zero new global state; reuses the tab machinery and the existing
  `TabKey` union. Lowest-risk, most consistent with the current architecture. The name
  "Fleet" is already taken by the health/crons tab, so call the visual one **Map** (or
  **Live Map** / **Command**) to avoid collision.
- **(Alternative) A view toggle on Summary.** A small segmented control in the header
  (`text ▢ | map ◉`) that swaps the *Summary* body between `SummaryView` and `FleetMap`.
  More "moded", but introduces a second axis of UI state next to the tab bar and muddies
  the otherwise-flat nav. Prefer the 6th-tab approach unless we explicitly want the map to
  be the landing experience.

Either way the toggle is in-memory state (consistent with the existing "no routing/URL per
tab" decision in the summary-and-tabs spec). The map reads the **same** `Overview` object
the other tabs poll — no new endpoint, no new collector, no backend change.

## 2. Live data we already have to drive it

Everything needed is already in the one `/api/overview` snapshot (`types.ts`,
`Overview`). The visualization is a *re-presentation* of data the calm tabs already show —
that's what keeps it honest rather than decorative. Concrete field → visual mappings:

| Source field (`types.ts`) | Visual element | Animation / state |
|---|---|---|
| `instances[]` (`InstanceOverview`) | A **hub node** per machine (local / vps) | Anchored layout; agents/tasks orbit or cluster around their instance |
| `instance.reachable === false` | Hub node goes **red / dimmed**, dashed ring | Static (dead), maybe a slow "lost signal" fade |
| `instance.gateway.up`, `dispatcher.running` | Hub ring color: green (both up) / amber (one down) / red (unreachable) | Mirrors `instanceLevel()` logic already in `SummaryView.tsx` |
| `claude_agents[]` (`ClaudeAgent`) | An **agent node** (the "drones" of the fleet) | One per Claude Code agent on this machine |
| `agent.busy === true` | Node **pulses** (breathing glow) | Active animated pulse — the core "it's alive" signal |
| `agent.active` | Node bright + foregrounded; `idle`→dim | Steady glow vs. dormant |
| `agent.live === false` / `state: done` | Node fades out / settles to a "parked" ring | One-shot settle animation |
| `agent.state` (`active`/`idle`/`blocked`/`done`) | Node color/badge | `blocked` → amber warning halo |
| `agent.task` | Node label / tooltip | Shown on hover; truncated under the node |
| `agent.tokens`, `agent.in_flight` | Node size or a small meter ring | Scales subtly with work; avoid noisy jitter |
| `agent.model` | Node icon/tint (e.g. opus vs sonnet) | Static |
| `kanban.in_flight[]` (`InFlightTask`) | **Task tokens** that travel a hub→agent edge | A token "flows" from the instance hub to its `assignee` node |
| `in_flight_task.assignee` | Which agent edge the token rides | Connects task to agent visually = the "hand-off" feel |
| `in_flight_task.status` (`running`/`blocked`/…) | Token color | Reuse `STATUS_COLOR` from `BoardTab.tsx` (running=blue, blocked=amber, done=green, review=violet) |
| `kanban.counts` | Small stacked badge on the hub (ready/running/done) | Static counts |
| `reliability.today.catches` / `loop_breaks` | A brief **spark/flash** on the hub when the count ticks up | One-shot on change (diff between polls) |
| `crons[]` next-due | A faint countdown ring or "next: NAME in ~Nh" caption | Slow, low-emphasis |
| `usage.total_tokens` / `sessions` | Ambient HUD readout in a corner | Numeric, non-animated |
| `panel_errors[]` / `instance.error` | A warning glyph on the affected hub | Static badge + tooltip |
| `generated_at` / `stale` (from `useOverview`) | Whole canvas desaturates slightly when stale | Mirrors the existing header stale dot |

The key insight: **the data is already a small graph** — instances are hubs, Claude agents
are leaf nodes, in-flight kanban tasks are edges-in-motion between a hub and an assignee.
That's a graph of maybe 2 instances × a handful of agents × a few in-flight tasks — *tens*
of elements, not thousands. This rules a lot of heavyweight tooling out as overkill.

Note on edges: agent→instance association isn't a first-class field today. `ClaudeAgent`
has `cwd`/`session_id` but no `instance` ref (Claude agents are read from local `~/.claude`,
separate from Hermes instances). v1 should treat Claude agents as orbiting the **local**
hub, and draw task-flow edges using `in_flight_task.assignee` matched to agent `name` where
they line up. A real agent↔instance edge is a future backend nicety, not a v1 blocker.

## 3. Approaches (with honest trade-offs)

Scale reminder: we're animating **tens** of nodes that update on a **5s poll**
(`refresh_seconds`), in a dark Tailwind aesthetic with hand-tuned hex tokens (`#0a0a0b`
background, `#1f1f23` borders, status greens/ambers). That context drives the recommendation
hard toward *light* tooling.

### Approach A — SVG + Motion (framer-motion) hand-built node map ✅ recommended

Lay out hubs and agent nodes ourselves (simple radial/force-free deterministic layout —
instances as anchors, agents arranged around them) and render as SVG `<circle>`/`<g>` with
Tailwind/CSS for color and **Motion** (`motion.circle`, `AnimatePresence`) for pulses,
enter/exit, and task-token tweening along edges.

- **Live-state fit:** excellent. We control exactly how `busy`→pulse, `blocked`→halo,
  task-token→edge-flow map. Full ownership of the aesthetic to match the existing palette.
- **Alive feel:** very good. Breathing pulses, springy enter/exit, tokens gliding along
  paths (`offset-path` / animated path interpolation) read as a living fleet without being
  a gimmick.
- **Bundle/perf:** Motion full is ~**34 KB gzip** (some sources cite up to ~60 KB for the
  whole package), but with `LazyMotion` + the `m` component it drops to **~4.6 KB** for the
  initial render. Tree-shakable. Tens of SVG nodes at a 5s data cadence is trivial for the
  browser. This is the *only* approach that adds near-negligible weight.
- **Learning/maintenance:** low. It's just React + SVG + a declarative animation lib. No new
  mental model; any contributor who knows the existing panels can extend it.
- **Tailwind/aesthetic fit:** perfect — it *is* our DOM/SVG with our exact tokens.
- **Cost downside:** we write the layout math and edge-routing ourselves. For a fixed,
  small topology (hubs + orbiting leaves) that's an afternoon, not a research project. We
  don't get pan/zoom/minimap "for free."

### Approach B — react-flow (`@xyflow/react`) node graph

A purpose-built node/edge graph library: nodes, edges, handles, pan/zoom/minimap,
auto-layout out of the box.

- **Live-state fit:** good for *structure* (nodes + edges + pan/zoom), but it's built for
  **editable diagrams** (drag nodes, connect handles), most of which we don't want in a
  read-only dashboard. Custom node components let us style to taste.
- **Alive feel:** moderate. Animated edges exist, but continuous "breathing" pulses and
  task-tokens-in-flight still mean custom node components + your own CSS/Motion anyway — so
  you pay for the library *and* still hand-build the alive bits.
- **Bundle/perf:** heaviest of the practical options — **~50–60 KB gzip** for
  `@xyflow/react` (plus it pulls its own state/store deps). Justified when you need an
  interactive editor; hard to justify for ~20 read-only nodes.
- **Learning/maintenance:** moderate — real API surface (nodes/edges/handles/store,
  controlled vs uncontrolled). New concepts for contributors.
- **Tailwind/aesthetic fit:** workable (custom nodes are your JSX) but its default chrome
  (controls, minimap, handles, attribution) is opinionated and needs overriding to match
  the calm dark look.
- **When it'd win:** if we later want a genuinely interactive, zoomable, drag-to-arrange
  topology with many nodes. That's beyond this feature's intent.

### Approach C — Canvas / WebGL particle "fleet" view (raw `<canvas>` or PixiJS/three)

Render the fleet as a particle field / starfield-style scene; agents as glowing motes,
tasks as streaking particles. Raw 2D canvas needs no dep; a "3D command deck" via
react-three-fiber would be the maximalist version.

- **Live-state fit:** poor-to-moderate for *legibility*. Particle aesthetics look
  spectacular but make precise state ("which agent is blocked?", "what's this task?")
  harder to read and to make accessible (hover/tooltips/focus on canvas = extra work).
- **Alive feel:** highest "wow." Also the highest gimmick risk — easy to drift away from
  *useful*.
- **Bundle/perf:** raw canvas = ~0 KB dep but you build everything. react-three-fiber +
  three.js is **~150 KB+ gzip** (three alone dominates) and brings a GPU/animation-loop
  maintenance burden — heavy for tens of slow-changing nodes, and R3F still lacks full
  WebGPU support as of early 2026.
- **Learning/maintenance:** high (canvas hit-testing/text, or the whole three.js/R3F scene
  graph + render loop). Biggest ongoing cost, least aligned with a "calm" read-only tool.
- **Tailwind/aesthetic fit:** canvas is its own world — doesn't compose with Tailwind; you
  reimplement layout, text, theming.
- **When it'd win:** if "feel like sci-fi" outranks "read fleet state at a glance." For
  Argus, it doesn't.

### Recommendation

**Approach A: SVG + Motion.** It's the only option whose cost (≈5–35 KB, lazy-loadable)
matches the payoff for a ~20-node, 5s-cadence, dark-themed dashboard; it gives us total
control to hit both the calm aesthetic *and* the "alive" pulse; and it adds no new
architectural concepts. react-flow (B) is the right tool for an interactive editor we don't
need; canvas/3D (C) trades legibility and weight for wow we can't responsibly bank on in a
"calm, read-only" tool. Start with A; if a future need for zoomable, draggable, large
topologies emerges, revisit B then.

**Rough effort:** v1 in Approach A ≈ **2–4 focused days** (layout + node component +
pulse/token animation + tests + reduced-motion). Approach B similar build time but +bundle
and +API surface. Approach C is week(s) and ongoing upkeep.

## 4. Concrete v1 scope

A new `frontend/src/fleetmap/FleetMap.tsx`, reached via a new **Map** tab, rendering one
SVG scene from the live `Overview`:

1. **Hub node per instance.** Positioned across the canvas (2 instances today → simple
   left/right or evenly-spaced anchors). Ring color from the existing `instanceLevel()`
   rule (reuse the helper from `SummaryView.tsx`): green both-up / amber one-down / red
   unreachable. Label = `inst.name` + transport. Small kanban count badge
   (ready/running/done from `kanban.counts`).
2. **Agent nodes orbiting the local hub.** One node per `claude_agents[]` entry, arranged
   in a ring around the local instance. Color/badge from `agent.state`; **`busy` nodes
   pulse** (the headline animation); `idle` dim; `blocked` gets an amber halo; `done`/not
   `live` settle to a parked outline. Hover tooltip shows `name`, `task` (truncated),
   `model`, `tokens`.
3. **Task-flow tokens.** For each `kanban.in_flight[]` task, a small token that animates
   along the edge from its instance hub toward the matching `assignee` agent node (fall
   back to a generic "in flight near the hub" orbit if no agent matches). Token color =
   `STATUS_COLOR[status]` reused from `BoardTab.tsx`.
4. **Ambient HUD.** A corner readout: total active agents, total in-flight, next cron
   (`nextCron()` logic already exists in `SummaryView.tsx`), today's catches/loop-breaks,
   7-day tokens. Static text, not animated — the calm anchor of the scene.
5. **Stale / reduced-motion behavior.** When `stale` (from `useOverview`), desaturate the
   whole scene and freeze pulses (matches the header's stale indicator). When
   `prefers-reduced-motion`, render the same layout with **no continuous animation** —
   `busy` shown as a static brighter ring instead of a pulse. Empty state ("no agents
   running") shows a calm idle scene, not a blank canvas.
6. **Click-through.** Clicking an agent node / task token navigates to the relevant text
   tab (Agents / Board) via the existing `onNavigate(tab)` pattern — the visual map is a
   *launchpad into* the detailed text views, reinforcing that text mode is first-class.

Everything is derived from the existing snapshot and re-uses existing helpers
(`instanceLevel`, `nextCron`, `STATUS_COLOR`, the status palette). **No backend change, no
new endpoint, no new dependency beyond Motion.**

### Testing (consistent with house style)
- Pure layout/derivation helpers (e.g. `buildFleetGraph(overview)` → `{hubs, agents,
  edges}`) unit-tested with sample healthy + degraded snapshots (no DOM, like
  `deriveAlerts`).
- Component test: renders a hub per instance, a node per agent, marks `busy`/`blocked`
  correctly, renders a token per in-flight task, shows the empty state.
- Reduced-motion: asserts no animated/pulse class when the media query is set.
- Existing tabs/tests untouched; frontend suite stays green (build includes type-check).

## 5. Risks, open questions, out-of-scope

### Risks / open questions
- **Gimmick drift.** The biggest risk is "pretty but useless." Mitigation: every animated
  element must encode a *real* state field (table in §2); no purely decorative motion. The
  HUD + click-through keep it tethered to the actual data and the text views.
- **Agent↔instance edges aren't first-class.** Claude agents come from local `~/.claude`,
  Hermes instances from the CLI; there's no `instance` field on `ClaudeAgent`. v1 orbits
  agents around the local hub and matches task edges by `assignee` name. A proper backend
  association is a possible follow-up, not a v1 dependency.
- **Task-token matching.** `in_flight_task.assignee` is a string; matching it to an agent
  `name` may not always line up. Fall back gracefully (token orbits the hub) rather than
  dropping the task.
- **Poll cadence vs. "live" feel.** Data only changes every ~5s, so motion is mostly
  *ambient* (pulses/orbits) between polls, with transitions when new data arrives. Set
  expectations: it's a living *status* view, not a real-time stream. Diff-on-poll
  (catches/loop-break sparks) needs care to avoid flashing on every refresh.
- **Bundle discipline.** Even Motion should be lazy-loaded (code-split the Map tab) so the
  default text experience pays nothing for a mode the user may never open.
- **Accessibility.** SVG nodes need labels/roles and keyboard focus for parity with the
  text tabs; reduced-motion is mandatory, not optional.

### Out of scope (YAGNI)
- Any backend/collector/contract change or new endpoint.
- Pan/zoom/minimap, drag-to-rearrange, user-saved layouts (that's the react-flow world we
  deliberately skipped).
- 3D / WebGL / particle scenes (Approach C).
- Real-time streaming / websockets — keep the existing poll.
- Historical playback, timelines, or animation of past activity.
- Visualizing remote (SSH) Claude agents we don't actually collect.
- Replacing or restyling any existing tab. Fleet Mode is purely additive.
