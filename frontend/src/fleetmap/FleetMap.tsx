import { useState } from 'react';
import type { Overview } from '../types';
import type { TabKey } from '../nav/Tabs';
import { STATUS } from '../ui/Card';
import { buildFleetGraph, type AgentNode } from './layout';
import './fleetmap.css';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function agentColor(a: AgentNode): string {
  if (a.busy) return '#22c55e';
  if (a.blocked) return '#f59e0b';
  if (a.live) return '#3b82f6';
  if (a.done) return '#52525b';
  return '#a1a1aa';
}

function nextCron(overview: Overview): { name: string; rel: string } | null {
  const now = Date.now();
  let best: { name: string; t: number } | null = null;
  for (const inst of overview.instances) {
    for (const c of inst.crons ?? []) {
      const t = new Date(c.next_run).getTime();
      if (Number.isNaN(t) || t < now) continue;
      if (!best || t < best.t) best = { name: c.name, t };
    }
  }
  if (!best) return null;
  const h = Math.round((best.t - now) / 3_600_000);
  return { name: best.name, rel: h < 1 ? 'soon' : h < 24 ? `~${h}h` : `~${Math.round(h / 24)}d` };
}

function HudItem({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

export function FleetMap({
  overview,
  stale,
  onNavigate,
}: {
  overview: Overview;
  stale: boolean;
  onNavigate: (t: TabKey) => void;
}) {
  const g = buildFleetGraph(overview);
  const [hover, setHover] = useState<AgentNode | null>(null);

  const agents = overview.claude_agents ?? [];
  const activeAgents = agents.filter((a) => a.active).length;
  const tokens7d = overview.instances.reduce((s, i) => s + (i.usage?.total_tokens ?? 0), 0);
  const sessions = overview.instances.reduce((s, i) => s + (i.usage?.sessions ?? 0), 0);
  const hasRel = overview.instances.some((i) => i.reliability?.configured);
  const catches = overview.instances.reduce((s, i) => s + (i.reliability?.today?.catches ?? 0), 0);
  const breaks = overview.instances.reduce((s, i) => s + (i.reliability?.today?.loop_breaks ?? 0), 0);
  const cron = nextCron(overview);
  const empty = g.hubs.length === 0;

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}>
        Map
      </h2>

      {/* Ambient HUD */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3 text-xs" style={{ color: '#71717a' }}>
        <HudItem>◉ <span style={{ color: '#a1a1aa' }}>{activeAgents}</span> active</HudItem>
        <HudItem>⚡ <span style={{ color: '#a1a1aa' }}>{g.tokens.length}</span> in-flight</HudItem>
        {cron && <HudItem>⏰ next <span style={{ color: '#a1a1aa' }}>{cron.name}</span> {cron.rel}</HudItem>}
        <HudItem>{fmtTokens(tokens7d)} tokens · 7d</HudItem>
        <HudItem>{sessions} sessions</HudItem>
        {hasRel && <HudItem>{catches} catches · {breaks} loop-breaks</HudItem>}
      </div>

      <div
        className={`rounded-xl border overflow-hidden ${stale ? 'fleet--stale' : ''}`}
        style={{ background: '#0a0a0b', borderColor: '#1f1f23' }}
      >
        {empty ? (
          <p className="text-sm px-5 py-16 text-center" style={{ color: '#52525b' }}>
            No instances configured — the fleet map is idle.
          </p>
        ) : (
          <svg viewBox={`0 0 ${g.width} ${g.height}`} width="100%" style={{ display: 'block' }}>
            {/* edges: local hub → its agents */}
            {g.edges.map((e, i) => (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#1f1f23" strokeWidth={1} />
            ))}

            {/* task tokens orbit their hub */}
            {g.hubs.map((h) => {
              const ts = g.tokens.filter((t) => t.hubX === h.x && t.hubY === h.y);
              if (!ts.length) return null;
              return (
                <g key={`orbit-${h.name}`} className="fleet-orbit" style={{ transformOrigin: `${h.x}px ${h.y}px` }}>
                  {ts.map((t) => <circle key={t.id} cx={t.cx} cy={t.cy} r={4} fill={t.color} />)}
                </g>
              );
            })}

            {/* hubs */}
            {g.hubs.map((h) => {
              const c = STATUS[h.level];
              return (
                <g key={h.name} onClick={() => onNavigate('board')} style={{ cursor: 'pointer' }}>
                  <circle cx={h.x} cy={h.y} r={34} fill="#111113" stroke={c.color} strokeWidth={2.5} />
                  <text x={h.x} y={h.y + 4} textAnchor="middle" fontSize={13} fill="#f4f4f5" fontWeight={600}>
                    {h.name}
                  </text>
                  <text x={h.x} y={h.y + 54} textAnchor="middle" fontSize={10} fill="#52525b">
                    {h.transport} · {h.inFlight} in-flight
                  </text>
                </g>
              );
            })}

            {/* agent nodes orbiting the local hub */}
            {g.agents.map((a) => (
              <g
                key={a.id}
                onMouseEnter={() => setHover(a)}
                onMouseLeave={() => setHover((h) => (h === a ? null : h))}
                onClick={() => onNavigate('agents')}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={a.done ? 7 : 11}
                  className={`${a.busy ? 'fleet-agent--busy' : ''} ${a.blocked ? 'fleet-agent--blocked' : ''}`}
                  fill={a.done ? 'none' : agentColor(a)}
                  stroke={agentColor(a)}
                  strokeWidth={2}
                  opacity={a.live || a.busy ? 1 : 0.5}
                />
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* hover caption (keeps the scene clean; no absolute-positioned tooltip math) */}
      <p className="text-xs mt-3 h-4" style={{ color: '#71717a' }}>
        {hover ? (
          <>
            <span className="font-medium" style={{ color: '#d4d4d8' }}>{hover.name || hover.id}</span>
            {hover.model && <> · {hover.model}</>} · {fmtTokens(hover.tokens)} tok
            {hover.task && <> — {hover.task}</>}
          </>
        ) : (
          'Hover an agent for detail · click to jump into its tab.'
        )}
      </p>
    </div>
  );
}

export default FleetMap;
