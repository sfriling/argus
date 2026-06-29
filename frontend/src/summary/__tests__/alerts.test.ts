import { describe, it, expect } from 'vitest';
import { deriveAlerts } from '../alerts';
import type { Overview, InstanceOverview } from '../../types';

function inst(over: Partial<InstanceOverview> = {}): InstanceOverview {
  return {
    name: 'local',
    transport: 'local',
    reachable: true,
    error: null,
    gateway: { up: true, detail: '' },
    dispatcher: { running: true },
    active_profile: 'orchestrator',
    profiles: [],
    kanban: { counts: {}, in_flight: [] },
    crons: [],
    reliability: { configured: true, today: { catches: 0, loop_breaks: 0 }, recent: [] },
    usage: { days: 7, sessions: 0, messages: 0, tool_calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, active_time: '', models: [], top_tools: [] },
    sessions: [],
    panel_errors: [],
    ...over,
  };
}

function ov(instances: InstanceOverview[]): Overview {
  return { generated_at: '', refresh_seconds: 5, instances, claude_agents: [] };
}

describe('deriveAlerts', () => {
  it('is ok (green) when everything is healthy', () => {
    const a = deriveAlerts(ov([inst(), inst({ name: 'vps', transport: 'ssh' })]));
    expect(a.level).toBe('ok');
    expect(a.messages).toEqual([]);
  });

  it('is down (red) for an unreachable instance, and suppresses noise', () => {
    const a = deriveAlerts(ov([inst({ name: 'vps', reachable: false, error: 'ssh timeout' })]));
    expect(a.level).toBe('down');
    expect(a.messages).toEqual(['vps unreachable']);
  });

  it('warns on a downed gateway', () => {
    const a = deriveAlerts(ov([inst({ gateway: { up: false, detail: '' } })]));
    expect(a.level).toBe('warn');
    expect(a.messages[0]).toMatch(/gateway down/);
  });

  it('warns on blocked kanban tasks', () => {
    const a = deriveAlerts(ov([inst({ kanban: { counts: { blocked: 2 }, in_flight: [] } })]));
    expect(a.level).toBe('warn');
    expect(a.messages[0]).toMatch(/2 kanban tasks blocked/);
  });

  it('warns on a loop-break today', () => {
    const a = deriveAlerts(ov([inst({ reliability: { configured: true, today: { catches: 0, loop_breaks: 1 }, recent: [] } })]));
    expect(a.level).toBe('warn');
    expect(a.messages[0]).toMatch(/1 loop-break today/);
  });

  it('escalates to down when both warn and down conditions exist', () => {
    const a = deriveAlerts(ov([
      inst({ gateway: { up: false, detail: '' } }),
      inst({ name: 'vps', reachable: false }),
    ]));
    expect(a.level).toBe('down');
  });
});
