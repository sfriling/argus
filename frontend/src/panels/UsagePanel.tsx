import type { InstanceOverview, Usage } from '../types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-lg p-3 text-center" style={{ background: '#0a0a0b' }}>
      <p className="text-2xl font-semibold leading-none" style={{ color: '#f4f4f5' }}>
        {value}
      </p>
      <p className="text-xs mt-1.5" style={{ color: '#52525b' }}>
        {label}
      </p>
    </div>
  );
}

function ModelBars({ usage }: { usage: Usage }) {
  const max = Math.max(1, ...usage.models.map((m) => m.tokens));
  return (
    <div className="space-y-2">
      {usage.models.map((m) => (
        <div key={m.name}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-xs" style={{ color: '#a1a1aa' }}>
              {m.name}
            </span>
            <span className="text-xs" style={{ color: '#52525b' }}>
              {formatTokens(m.tokens)}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1f1f23' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round((m.tokens / max) * 100)}%`,
                background: '#3b82f6',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InstanceUsage({ instance }: { instance: InstanceOverview }) {
  const u = instance.usage;
  const empty = u.sessions === 0 && u.total_tokens === 0;

  return (
    <div className="rounded-xl border p-5" style={{ background: '#111113', borderColor: '#1f1f23' }}>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: instance.reachable ? '#22c55e' : '#ef4444' }}
        />
        <span className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>
          {instance.name}
        </span>
        <span
          className="text-xs font-medium uppercase tracking-wider ml-auto"
          style={{ color: '#52525b' }}
        >
          {u.days}d
        </span>
      </div>

      {empty ? (
        <p className="text-sm py-2" style={{ color: '#52525b' }}>
          No activity
        </p>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <StatCard value={String(u.sessions)} label="sessions" />
            <StatCard value={String(u.tool_calls)} label="tool calls" />
            <StatCard value={formatTokens(u.total_tokens)} label="tokens" />
          </div>

          {u.active_time && (
            <p className="text-xs mb-4" style={{ color: '#52525b' }}>
              Active time <span style={{ color: '#a1a1aa' }}>{u.active_time}</span>
              {' · '}
              {u.messages} messages
            </p>
          )}

          {u.models.length > 0 && (
            <div className="mb-4">
              <p
                className="text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: '#52525b' }}
              >
                Models
              </p>
              <ModelBars usage={u} />
            </div>
          )}

          {u.top_tools.length > 0 && (
            <div>
              <p
                className="text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: '#52525b' }}
              >
                Top tools
              </p>
              <div className="flex flex-wrap gap-1.5">
                {u.top_tools.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ color: '#a1a1aa', background: '#0a0a0b' }}
                  >
                    <span className="font-mono">{t.name}</span>
                    <span style={{ color: '#52525b' }}>{t.calls}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type UsagePanelProps = {
  instances: InstanceOverview[];
};

export function UsagePanel({ instances }: UsagePanelProps) {
  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Usage
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {instances.map((inst) => (
          <InstanceUsage key={inst.name} instance={inst} />
        ))}
      </div>
    </div>
  );
}
