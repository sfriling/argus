import type { Overview } from '../types';
import type { StatusLevel } from '../ui/Card';
import { instanceLevel } from '../lib/status';

export const MAP_W = 800;
export const MAP_H = 480;

// Task-token colour by kanban status (mirrors BoardTab's STATUS_COLOR).
const TOKEN_COLOR: Record<string, string> = {
  running: '#3b82f6',
  blocked: '#f59e0b',
  done: '#22c55e',
  review: '#a78bfa',
  ready: '#a1a1aa',
};

export type Hub = {
  name: string;
  x: number;
  y: number;
  level: StatusLevel;
  transport: string;
  counts: Record<string, number>;
  inFlight: number;
  local: boolean;
};

export type AgentNode = {
  id: string;
  x: number;
  y: number;
  busy: boolean;
  blocked: boolean;
  live: boolean;
  done: boolean;
  name: string;
  task: string;
  model: string;
  tokens: number;
};

export type Edge = { x1: number; y1: number; x2: number; y2: number };

export type TaskToken = { id: string; cx: number; cy: number; hubX: number; hubY: number; color: string };

export type FleetGraph = {
  width: number;
  height: number;
  hubs: Hub[];
  agents: AgentNode[];
  edges: Edge[];
  tokens: TaskToken[];
};

/** Pure layout: instances → hubs (spread horizontally), Claude agents → ring around the local
 *  hub, kanban in-flight tasks → tokens around their instance hub. No DOM, fully testable. */
export function buildFleetGraph(overview: Overview): FleetGraph {
  const instances = overview.instances ?? [];
  const n = instances.length;

  const hubs: Hub[] = instances.map((inst, i) => ({
    name: inst.name,
    x: (MAP_W * (i + 1)) / (n + 1),
    y: MAP_H / 2,
    level: instanceLevel(inst),
    transport: inst.transport,
    counts: inst.kanban?.counts ?? {},
    inFlight: inst.kanban?.in_flight?.length ?? 0,
    local: inst.transport === 'local',
  }));

  const localHub = hubs.find((h) => h.local) ?? hubs[0];
  const claude = overview.claude_agents ?? [];
  const agents: AgentNode[] = [];
  const edges: Edge[] = [];

  if (localHub) {
    const R = 140;
    const K = claude.length;
    claude.forEach((a, k) => {
      const ang = -Math.PI / 2 + (K > 0 ? (2 * Math.PI * k) / K : 0);
      const x = localHub.x + R * Math.cos(ang);
      const y = localHub.y + R * Math.sin(ang);
      agents.push({
        id: a.id,
        x,
        y,
        busy: !!a.busy,
        blocked: a.state === 'blocked',
        live: !!a.live,
        done: a.state === 'done' && !a.live,
        name: a.name,
        task: a.task,
        model: a.model,
        tokens: a.tokens,
      });
      edges.push({ x1: localHub.x, y1: localHub.y, x2: x, y2: y });
    });
  }

  const tokens: TaskToken[] = [];
  instances.forEach((inst, hi) => {
    const hub = hubs[hi];
    const tasks = inst.kanban?.in_flight ?? [];
    const tr = 64;
    tasks.forEach((t, ti) => {
      const ang = (2 * Math.PI * ti) / Math.max(tasks.length, 1);
      tokens.push({
        id: `${inst.name}:${t.id}`,
        hubX: hub.x,
        hubY: hub.y,
        cx: hub.x + tr * Math.cos(ang),
        cy: hub.y + tr * Math.sin(ang),
        color: TOKEN_COLOR[(t.status || '').toLowerCase()] ?? '#71717a',
      });
    });
  });

  return { width: MAP_W, height: MAP_H, hubs, agents, edges, tokens };
}
