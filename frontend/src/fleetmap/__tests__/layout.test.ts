import { describe, it, expect } from 'vitest';
import { buildFleetGraph } from '../layout';
import { sampleOverview } from '../../sample';
import type { Overview } from '../../types';

describe('buildFleetGraph', () => {
  it('makes a hub per instance with a health level', () => {
    const g = buildFleetGraph(sampleOverview);
    expect(g.hubs.map((h) => h.name)).toEqual(['local', 'vps']);
    expect(g.hubs[0].level).toBe('ok'); // sample local is reachable, gateway+dispatcher up
    expect(g.hubs[0].local).toBe(true);
  });

  it('makes an agent node per Claude agent, flagging busy', () => {
    const g = buildFleetGraph(sampleOverview);
    expect(g.agents.length).toBe(sampleOverview.claude_agents.length);
    expect(g.agents[0].busy).toBe(true); // first sample agent is busy
    expect(g.edges.length).toBe(g.agents.length); // one local-hub→agent edge each
  });

  it('makes a token per in-flight kanban task', () => {
    const g = buildFleetGraph(sampleOverview);
    const expected = sampleOverview.instances.reduce((n, i) => n + i.kanban.in_flight.length, 0);
    expect(g.tokens.length).toBe(expected);
  });

  it('handles an empty fleet', () => {
    const empty: Overview = { generated_at: '', refresh_seconds: 5, instances: [], claude_agents: [] };
    const g = buildFleetGraph(empty);
    expect(g.hubs).toEqual([]);
    expect(g.agents).toEqual([]);
    expect(g.tokens).toEqual([]);
  });
});
