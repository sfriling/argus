import type { CronEntry, InstanceOverview } from '../types';

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  ok: { color: '#22c55e', bg: '#22c55e18' },
  error: { color: '#ef4444', bg: '#ef444418' },
  running: { color: '#3b82f6', bg: '#3b82f618' },
  skipped: { color: '#71717a', bg: '#71717a18' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status.toLowerCase()] ?? {
    color: '#a1a1aa',
    bg: '#a1a1aa18',
  };
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium capitalize"
      style={{ color: style.color, background: style.bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: style.color }}
      />
      {status}
    </span>
  );
}

function formatNextRun(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffH = Math.round(diffMs / 3_600_000);
    const diffD = Math.round(diffMs / 86_400_000);
    if (Math.abs(diffH) < 24) {
      return diffH >= 0
        ? `in ${diffH}h`
        : `${Math.abs(diffH)}h ago`;
    }
    return diffD >= 0 ? `in ${diffD}d` : `${Math.abs(diffD)}d ago`;
  } catch {
    return iso;
  }
}

function CronTable({
  instanceName,
  crons,
}: {
  instanceName: string;
  crons: CronEntry[];
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: '#111113', borderColor: '#1f1f23' }}
    >
      {/* Instance header */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: '#1f1f23', background: '#0a0a0b' }}
      >
        <span className="text-xs font-semibold" style={{ color: '#71717a' }}>
          {instanceName}
        </span>
      </div>

      {crons.length === 0 ? (
        <p className="text-sm px-4 py-4" style={{ color: '#52525b' }}>
          No crons configured
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #1f1f23' }}>
              {['Name', 'Schedule', 'Next Run', 'Last Status'].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider"
                  style={{ color: '#52525b' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crons.map((cron, i) => (
              <tr
                key={cron.name}
                style={{
                  borderTop: i > 0 ? '1px solid #1f1f23' : undefined,
                }}
              >
                <td className="px-4 py-3" style={{ color: '#f4f4f5' }}>
                  {cron.name}
                </td>
                <td
                  className="px-4 py-3 font-mono text-xs"
                  style={{ color: '#71717a' }}
                >
                  {cron.schedule}
                </td>
                <td className="px-4 py-3" style={{ color: '#a1a1aa' }}>
                  {formatNextRun(cron.next_run)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={cron.last_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type CronsPanelProps = {
  instances: InstanceOverview[];
};

export function CronsPanel({ instances }: CronsPanelProps) {
  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Crons
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {instances.map((inst) => (
          <CronTable
            key={inst.name}
            instanceName={inst.name}
            crons={inst.crons}
          />
        ))}
      </div>
    </div>
  );
}
