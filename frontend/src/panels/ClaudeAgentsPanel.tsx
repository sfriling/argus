import type { ClaudeAgent } from '../types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function cwdLabel(cwd: string): string {
  if (!cwd) return '';
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

function relTime(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 60) return `${Math.max(secs, 0)}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function stateStyle(agent: ClaudeAgent): { label: string; color: string; bg: string } {
  const s = agent.state.toLowerCase();
  if (s === 'blocked') return { label: 'waiting', color: '#f59e0b', bg: '#f59e0b18' };
  if (agent.live && s !== 'done') return { label: 'running', color: '#22c55e', bg: '#22c55e18' };
  if (agent.active) return { label: 'active', color: '#3b82f6', bg: '#3b82f618' };
  if (s === 'done') return { label: 'done', color: '#71717a', bg: '#71717a18' };
  return { label: s || 'idle', color: '#a1a1aa', bg: '#a1a1aa18' };
}

function StateBadge({ agent }: { agent: ClaudeAgent }) {
  const { label, color, bg } = stateStyle(agent);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
      style={{ color, background: bg }}
    >
      {agent.live && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}
      {label}
    </span>
  );
}

function Meta({ agent }: { agent: ClaudeAgent }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: '#52525b' }}>
      {agent.model && <span className="font-mono">{agent.model}</span>}
      <span>{formatTokens(agent.tokens)} tok</span>
      {agent.cwd && (
        <span className="font-mono" style={{ color: '#52525b' }}>
          {cwdLabel(agent.cwd)}
        </span>
      )}
      {agent.in_flight > 0 && <span>{agent.in_flight} in-flight</span>}
      {agent.updated_at && <span>{relTime(agent.updated_at)}</span>}
    </div>
  );
}

function ActiveCard({ agent }: { agent: ClaudeAgent }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: '#111113', borderColor: '#1f1f23' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold truncate" style={{ color: '#f4f4f5' }}>
          {agent.name || agent.id}
        </span>
        <span className="ml-auto">
          <StateBadge agent={agent} />
        </span>
      </div>
      {agent.task && (
        <p className="text-sm mb-2" style={{ color: '#a1a1aa' }}>
          {agent.task}
        </p>
      )}
      <Meta agent={agent} />
    </div>
  );
}

function RecentRow({ agent }: { agent: ClaudeAgent }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: '#0a0a0b' }}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium truncate" style={{ color: '#d4d4d8' }}>
          {agent.name || agent.id}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: '#52525b' }}>
            {formatTokens(agent.tokens)} tok
          </span>
          <StateBadge agent={agent} />
        </span>
      </div>
      {agent.task && (
        <p className="text-xs mt-1 truncate" style={{ color: '#52525b' }}>
          {agent.task}
        </p>
      )}
    </div>
  );
}

type ClaudeAgentsPanelProps = {
  agents: ClaudeAgent[];
};

export function ClaudeAgentsPanel({ agents }: ClaudeAgentsPanelProps) {
  if (!agents || agents.length === 0) return null;

  const active = agents.filter((a) => a.active);
  const recent = agents.filter((a) => !a.active);

  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Claude Agents
      </h2>

      {active.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 mb-3">
          {active.map((a) => (
            <ActiveCard key={a.id} agent={a} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: '#3f3f46' }}
          >
            Recent
          </p>
          <div className="space-y-1.5">
            {recent.map((a) => (
              <RecentRow key={a.id} agent={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
