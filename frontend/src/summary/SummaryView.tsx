import type { Overview, InstanceOverview } from '../types';
import type { TabKey } from '../nav/Tabs';
import { Card, StatusDot, STATUS, type StatusLevel } from '../ui/Card';
import { deriveAlerts } from './alerts';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function instanceLevel(inst: InstanceOverview): StatusLevel {
  if (!inst.reachable) return 'down';
  if (!inst.gateway?.up || !inst.dispatcher?.running) return 'warn';
  return 'ok';
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold uppercase tracking-widest mb-3"
      style={{ color: '#52525b', letterSpacing: '0.1em' }}
    >
      {children}
    </h2>
  );
}

function AttentionStrip({ overview }: { overview: Overview }) {
  const alerts = deriveAlerts(overview);
  const s = STATUS[alerts.level];
  const text =
    alerts.level === 'ok' ? 'All systems nominal' : alerts.messages.join(' · ');
  return (
    <div
      className="rounded-xl border px-4 py-3 flex items-center gap-3"
      style={{ background: '#111113', borderColor: alerts.level === 'ok' ? '#1f1f23' : s.color + '55' }}
    >
      <StatusDot level={alerts.level} />
      <span className="text-sm" style={{ color: alerts.level === 'ok' ? '#a1a1aa' : s.color }}>
        {text}
      </span>
    </div>
  );
}

function HealthCard({ inst }: { inst: InstanceOverview }) {
  const level = instanceLevel(inst);
  const inFlight = inst.kanban?.in_flight?.length ?? 0;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <StatusDot level={level} />
        <span className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>{inst.name}</span>
        <span className="text-xs uppercase tracking-wider ml-auto" style={{ color: '#3f3f46' }}>
          {inst.transport}
        </span>
      </div>
      {inst.reachable ? (
        <div className="space-y-1.5 text-xs" style={{ color: '#a1a1aa' }}>
          <div className="flex gap-4">
            <span>gateway {inst.gateway?.up ? '✓' : '✗'}</span>
            <span>dispatcher {inst.dispatcher?.running ? '✓' : '✗'}</span>
          </div>
          <div style={{ color: '#71717a' }}>
            {inst.active_profile || '—'} · {inFlight} in flight
          </div>
        </div>
      ) : (
        <p className="text-xs" style={{ color: STATUS.down.color }}>{inst.error || 'unreachable'}</p>
      )}
    </Card>
  );
}

function LiveCard({
  title,
  big,
  sub,
  onClick,
}: {
  title: string;
  big: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <Card className="p-4" onClick={onClick}>
      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#52525b' }}>{title}</p>
      <p className="text-lg font-semibold" style={{ color: '#f4f4f5' }}>{big}</p>
      {sub && <p className="text-xs mt-1 truncate" style={{ color: '#71717a' }}>{sub}</p>}
    </Card>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card className="px-4 py-3 text-center flex-1">
      <p className="text-2xl font-semibold leading-none" style={{ color: '#f4f4f5' }}>{value}</p>
      <p className="text-xs mt-1.5" style={{ color: '#52525b' }}>{label}</p>
    </Card>
  );
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
  const rel = h < 1 ? 'soon' : h < 24 ? `in ~${h}h` : `in ~${Math.round(h / 24)}d`;
  return { name: best.name, rel };
}

export function SummaryView({
  overview,
  onNavigate,
}: {
  overview: Overview;
  onNavigate: (tab: TabKey) => void;
}) {
  const { instances } = overview;
  const agents = overview.claude_agents ?? [];
  const activeAgents = agents.filter((a) => a.active);
  const kanbanInFlight = instances.reduce((n, i) => n + (i.kanban?.in_flight?.length ?? 0), 0);
  const firstTask = instances.flatMap((i) => i.kanban?.in_flight ?? [])[0];
  const cron = nextCron(overview);

  const catches = instances.reduce((n, i) => n + (i.reliability?.today?.catches ?? 0), 0);
  const breaks = instances.reduce((n, i) => n + (i.reliability?.today?.loop_breaks ?? 0), 0);
  const tokens = instances.reduce((n, i) => n + (i.usage?.total_tokens ?? 0), 0);
  const sessions = instances.reduce((n, i) => n + (i.usage?.sessions ?? 0), 0);

  return (
    <div className="space-y-8">
      <AttentionStrip overview={overview} />

      <div>
        <SectionLabel>Fleet</SectionLabel>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {instances.map((inst) => (
            <HealthCard key={inst.name} inst={inst} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Live Now</SectionLabel>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <LiveCard
            title="Claude agents"
            big={`${activeAgents.length} active`}
            sub={activeAgents[0]?.name}
            onClick={() => onNavigate('agents')}
          />
          <LiveCard
            title="Kanban"
            big={`${kanbanInFlight} in flight`}
            sub={firstTask?.title}
            onClick={() => onNavigate('agents')}
          />
          <LiveCard
            title="Crons"
            big={cron ? cron.rel : 'none due'}
            sub={cron?.name}
            onClick={() => onNavigate('fleet')}
          />
        </div>
      </div>

      <div>
        <SectionLabel>Today</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <StatTile value={String(catches)} label="catches" />
          <StatTile value={String(breaks)} label="loop-breaks" />
          <StatTile value={formatTokens(tokens)} label="tokens · 7d" />
          <StatTile value={String(sessions)} label="sessions · 7d" />
        </div>
      </div>
    </div>
  );
}
