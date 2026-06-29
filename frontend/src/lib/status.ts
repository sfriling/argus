import type { InstanceOverview } from '../types';
import type { StatusLevel } from '../ui/Card';

/** Health level for an instance: down (unreachable) / warn (a service down) / ok. */
export function instanceLevel(inst: InstanceOverview): StatusLevel {
  if (!inst.reachable) return 'down';
  if (!inst.gateway?.up || !inst.dispatcher?.running) return 'warn';
  return 'ok';
}
