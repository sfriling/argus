import type { InstanceOverview } from '../types';

const STATUS_COLORS: Record<string, string> = {
  running: '#22c55e',
  ready: '#3b82f6',
  blocked: '#f59e0b',
  done: '#52525b',
};

function CountChip({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  const color = STATUS_COLORS[label] ?? '#52525b';
  return (
    <div
      className="flex flex-col items-center px-3 py-2 rounded-lg"
      style={{ background: '#0a0a0b', minWidth: 52 }}
    >
      <span className="text-lg font-semibold leading-none" style={{ color }}>
        {count}
      </span>
      <span
        className="text-xs mt-1 capitalize"
        style={{ color: '#52525b' }}
      >
        {label}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#52525b';
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium capitalize"
      style={{ color, background: `${color}18` }}
    >
      <span
        className="w-1 h-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {status}
    </span>
  );
}

function InstanceDelegation({ instance }: { instance: InstanceOverview }) {
  const { counts, in_flight } = instance.kanban;
  const orderedKeys = ['ready', 'running', 'blocked', 'done'];
  const allKeys = [
    ...orderedKeys.filter((k) => k in counts),
    ...Object.keys(counts).filter((k) => !orderedKeys.includes(k)),
  ];

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: '#111113', borderColor: '#1f1f23' }}
    >
      {/* Instance header */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: instance.reachable ? '#22c55e' : '#ef4444',
          }}
        />
        <span className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>
          {instance.name}
        </span>
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ background: '#27272a', color: '#71717a' }}
        >
          {instance.transport}
        </span>
      </div>

      {/* Count chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {allKeys.map((key) => (
          <CountChip key={key} label={key} count={counts[key] ?? 0} />
        ))}
      </div>

      {/* In-flight tasks */}
      {in_flight.length > 0 ? (
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#52525b' }}
          >
            In Flight
          </p>
          <div className="divide-y" style={{ borderColor: '#1f1f23' }}>
            {in_flight.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between py-2 gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs font-mono flex-shrink-0"
                    style={{ color: '#52525b' }}
                  >
                    {task.id}
                  </span>
                  <span
                    className="text-sm truncate"
                    style={{ color: '#a1a1aa' }}
                  >
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs" style={{ color: '#52525b' }}>
                    {task.assignee}
                  </span>
                  <StatusBadge status={task.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: '#52525b' }}>
          No tasks in flight
        </p>
      )}
    </div>
  );
}

type DelegationPanelProps = {
  instances: InstanceOverview[];
};

export function DelegationPanel({ instances }: DelegationPanelProps) {
  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Delegation
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {instances.map((inst) => (
          <InstanceDelegation key={inst.name} instance={inst} />
        ))}
      </div>
    </div>
  );
}
