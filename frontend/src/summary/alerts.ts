import type { Overview, InstanceOverview } from '../types';
import type { StatusLevel } from '../ui/Card';

export type Alerts = {
  level: StatusLevel;
  messages: string[];
};

function instanceAlerts(inst: InstanceOverview): { level: StatusLevel; msg: string }[] {
  const out: { level: StatusLevel; msg: string }[] = [];
  if (!inst.reachable) {
    out.push({ level: 'down', msg: `${inst.name} unreachable` });
    return out; // if we can't reach it, downstream checks are noise
  }
  if (!inst.gateway?.up) out.push({ level: 'warn', msg: `${inst.name} gateway down` });
  if (!inst.dispatcher?.running) out.push({ level: 'warn', msg: `${inst.name} dispatcher stopped` });

  const blocked =
    (inst.kanban?.counts?.blocked ?? 0) +
    (inst.kanban?.in_flight?.filter((t) => t.status?.toLowerCase() === 'blocked').length ?? 0);
  if (blocked > 0) out.push({ level: 'warn', msg: `${inst.name}: ${blocked} kanban task${blocked > 1 ? 's' : ''} blocked` });

  const breaks = inst.reliability?.today?.loop_breaks ?? 0;
  if (breaks > 0) out.push({ level: 'warn', msg: `${inst.name}: ${breaks} loop-break${breaks > 1 ? 's' : ''} today` });
  return out;
}

const RANK: Record<StatusLevel, number> = { ok: 0, warn: 1, down: 2 };

/** Derive the summary "does anything need me?" strip from the overview. Pure. */
export function deriveAlerts(overview: Overview): Alerts {
  const all = overview.instances.flatMap(instanceAlerts);
  if (all.length === 0) return { level: 'ok', messages: [] };
  const level = all.reduce<StatusLevel>((acc, a) => (RANK[a.level] > RANK[acc] ? a.level : acc), 'ok');
  return { level, messages: all.map((a) => a.msg) };
}
