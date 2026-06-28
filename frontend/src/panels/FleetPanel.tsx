import type { InstanceOverview } from '../types';

type StatusDotProps = { up: boolean; degraded?: boolean };

function StatusDot({ up, degraded }: StatusDotProps) {
  const color = degraded
    ? 'bg-accent-amber'
    : up
    ? 'bg-accent-green'
    : 'bg-accent-red';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`}
      style={{
        backgroundColor: degraded
          ? '#f59e0b'
          : up
          ? '#22c55e'
          : '#ef4444',
      }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs font-medium uppercase tracking-widest"
      style={{ color: '#52525b', letterSpacing: '0.08em' }}
    >
      {children}
    </span>
  );
}

function InstanceCard({ instance }: { instance: InstanceOverview }) {
  const isReachable = instance.reachable;
  const inFlight =
    (instance.kanban.counts['ready'] ?? 0) +
    (instance.kanban.counts['running'] ?? 0);

  if (!isReachable) {
    return (
      <div
        data-testid={`instance-card-${instance.name}`}
        className="rounded-xl p-5 border opacity-50"
        style={{
          background: '#111113',
          borderColor: '#1f1f23',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <StatusDot up={false} />
            <span className="font-medium" style={{ color: '#f4f4f5' }}>
              {instance.name}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                background: '#27272a',
                color: '#71717a',
              }}
            >
              {instance.transport}
            </span>
          </div>
          <span
            className="text-xs font-medium uppercase tracking-wider px-2 py-1 rounded"
            style={{ background: '#1f1f23', color: '#71717a' }}
          >
            degraded
          </span>
        </div>
        {instance.error && (
          <p
            className="text-sm font-mono mt-2"
            style={{ color: '#71717a' }}
            data-testid={`instance-error-${instance.name}`}
          >
            {instance.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={`instance-card-${instance.name}`}
      className="rounded-xl p-5 border transition-colors"
      style={{
        background: '#111113',
        borderColor: '#1f1f23',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <StatusDot up={instance.gateway.up} />
          <span className="font-semibold text-sm" style={{ color: '#f4f4f5' }}>
            {instance.name}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: '#27272a', color: '#71717a' }}
          >
            {instance.transport}
          </span>
        </div>
        <span className="text-xs" style={{ color: '#52525b' }}>
          {instance.gateway.detail}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg p-3" style={{ background: '#0a0a0b' }}>
          <SectionLabel>Dispatcher</SectionLabel>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: instance.dispatcher.running
                  ? '#22c55e'
                  : '#52525b',
              }}
            />
            <span className="text-sm font-medium" style={{ color: '#a1a1aa' }}>
              {instance.dispatcher.running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: '#0a0a0b' }}>
          <SectionLabel>Profile</SectionLabel>
          <p className="text-sm font-medium mt-1" style={{ color: '#a1a1aa' }}>
            {instance.active_profile}
          </p>
        </div>

        <div className="rounded-lg p-3" style={{ background: '#0a0a0b' }}>
          <SectionLabel>In Flight</SectionLabel>
          <p className="text-sm font-semibold mt-1" style={{ color: '#f4f4f5' }}>
            {inFlight}
            <span
              className="text-xs font-normal ml-1"
              style={{ color: '#52525b' }}
            >
              tasks
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

type FleetPanelProps = {
  instances: InstanceOverview[];
};

export function FleetPanel({ instances }: FleetPanelProps) {
  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Fleet
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {instances.map((inst) => (
          <InstanceCard key={inst.name} instance={inst} />
        ))}
      </div>
    </div>
  );
}
