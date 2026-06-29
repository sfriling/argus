import type { InstanceOverview, ReliabilityRecent } from '../types';

/** Color a recent entry by action and attempt count */
function getRecentStyle(entry: ReliabilityRecent): { color: string; bg: string } {
  if (entry.attempt >= 2) {
    // Loop break territory — red
    return { color: '#ef4444', bg: '#ef444418' };
  }
  if (entry.action === 'rejected') {
    return { color: '#f59e0b', bg: '#f59e0b18' };
  }
  if (entry.action === 'inferred') {
    return { color: '#3b82f6', bg: '#3b82f618' };
  }
  return { color: '#a1a1aa', bg: '#a1a1aa18' };
}

function ActionBadge({ entry }: { entry: ReliabilityRecent }) {
  const { color, bg } = getRecentStyle(entry);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ color, background: bg }}
    >
      {entry.action}
      {entry.attempt >= 2 && (
        <span className="opacity-70">×{entry.attempt}</span>
      )}
    </span>
  );
}

function TallyCard({
  catches,
  loop_breaks,
}: {
  catches: number;
  loop_breaks: number;
}) {
  return (
    <div className="flex gap-3 mb-4">
      <div
        className="flex-1 rounded-lg p-3 text-center"
        style={{ background: '#0a0a0b' }}
      >
        <p
          className="text-2xl font-semibold leading-none"
          style={{ color: '#f59e0b' }}
        >
          {catches}
        </p>
        <p className="text-xs mt-1.5" style={{ color: '#52525b' }}>
          catches
        </p>
      </div>
      <div
        className="flex-1 rounded-lg p-3 text-center"
        style={{ background: '#0a0a0b' }}
      >
        <p
          className="text-2xl font-semibold leading-none"
          style={{ color: loop_breaks > 0 ? '#ef4444' : '#52525b' }}
        >
          {loop_breaks}
        </p>
        <p className="text-xs mt-1.5" style={{ color: '#52525b' }}>
          loop breaks
        </p>
      </div>
    </div>
  );
}

function InstanceReliability({ instance }: { instance: InstanceOverview }) {
  const { today, recent } = instance.reliability;

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
          className="text-xs font-medium uppercase tracking-wider ml-auto"
          style={{ color: '#52525b' }}
        >
          Today
        </span>
      </div>

      <TallyCard catches={today.catches} loop_breaks={today.loop_breaks} />

      {/* Recent entries */}
      {recent.length > 0 && (
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#52525b' }}
          >
            Recent
          </p>
          <div className="space-y-1.5">
            {recent.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: '#0a0a0b' }}
              >
                <span
                  className="font-mono text-xs flex-shrink-0"
                  style={{ color: '#71717a' }}
                >
                  {entry.tool}
                </span>
                <span style={{ color: '#1f1f23' }}>·</span>
                <span className="text-xs flex-shrink-0" style={{ color: '#52525b' }}>
                  {entry.field}
                </span>
                <div className="ml-auto">
                  <ActionBadge entry={entry} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ReliabilityPanelProps = {
  instances: InstanceOverview[];
};

export function ReliabilityPanel({ instances }: ReliabilityPanelProps) {
  // Only instances that actually have reliability data (a trajectory log) show here.
  // With none, the panel is hidden entirely — no dead-end for users not running a guard.
  const shown = instances.filter((i) => i.reliability?.configured);
  if (shown.length === 0) return null;

  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Reliability
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {shown.map((inst) => (
          <InstanceReliability key={inst.name} instance={inst} />
        ))}
      </div>
    </div>
  );
}
