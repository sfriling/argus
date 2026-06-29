import { useOverview } from './useOverview';
import { FleetPanel } from './panels/FleetPanel';
import { ClaudeAgentsPanel } from './panels/ClaudeAgentsPanel';
import { DelegationPanel } from './panels/DelegationPanel';
import { CronsPanel } from './panels/CronsPanel';
import { ReliabilityPanel } from './panels/ReliabilityPanel';
import { UsagePanel } from './panels/UsagePanel';
import { SessionsPanel } from './panels/SessionsPanel';
import { ProfilesPanel } from './panels/ProfilesPanel';

function formatSecondsAgo(date: Date | null): string {
  if (!date) return '—';
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

function Header({
  stale,
  lastUpdated,
}: {
  stale: boolean;
  lastUpdated: Date | null;
}) {
  return (
    <header
      className="sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between"
      style={{
        background: 'rgba(10,10,11,0.85)',
        borderColor: '#1f1f23',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-3">
        <div>
          <h1
            className="text-sm font-semibold tracking-widest uppercase leading-none"
            style={{ color: '#f4f4f5', letterSpacing: '0.15em' }}
          >
            ARGUS
          </h1>
          <p
            className="text-xs mt-0.5 uppercase tracking-widest"
            style={{ color: '#52525b', letterSpacing: '0.1em' }}
          >
            Hermes fleet
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: stale ? '#f59e0b' : '#22c55e',
            boxShadow: stale
              ? '0 0 6px #f59e0b66'
              : '0 0 6px #22c55e66',
          }}
        />
        <span className="text-xs" style={{ color: '#52525b' }}>
          {stale ? 'stale · ' : ''}updated {formatSecondsAgo(lastUpdated)}
        </span>
      </div>
    </header>
  );
}

function LoadingScreen() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#0a0a0b' }}
    >
      <div className="text-center">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-4"
          style={{ borderColor: '#27272a', borderTopColor: 'transparent' }}
        />
        <p className="text-sm" style={{ color: '#52525b' }}>
          Connecting to fleet…
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { data, stale, lastUpdated } = useOverview();

  if (!data) return <LoadingScreen />;

  const { instances } = data;
  const claudeAgents = data.claude_agents ?? [];

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0b' }}>
      <Header stale={stale} lastUpdated={lastUpdated} />

      <main className="px-4 sm:px-6 py-8 max-w-6xl mx-auto space-y-10">
        <FleetPanel instances={instances} />
        <ClaudeAgentsPanel agents={claudeAgents} />
        <DelegationPanel instances={instances} />
        <CronsPanel instances={instances} />
        <ReliabilityPanel instances={instances} />
        <UsagePanel instances={instances} />
        <SessionsPanel instances={instances} />
        <ProfilesPanel instances={instances} />
      </main>

      <footer
        className="px-6 py-4 border-t text-center"
        style={{ borderColor: '#1f1f23' }}
      >
        <p className="text-xs" style={{ color: '#3f3f46' }}>
          Argus · Hermes fleet dashboard
        </p>
      </footer>
    </div>
  );
}
