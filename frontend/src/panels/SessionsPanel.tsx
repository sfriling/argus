import type { InstanceOverview, SessionEntry } from '../types';

function SessionRow({ session }: { session: SessionEntry }) {
  const isCron = session.id.startsWith('cron_');
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: '#0a0a0b' }}>
      <div className="flex items-center gap-2">
        {isCron && (
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
            style={{ color: '#a78bfa', background: '#a78bfa18' }}
          >
            cron
          </span>
        )}
        <span
          className="text-sm font-medium truncate"
          style={{ color: session.title ? '#f4f4f5' : '#71717a' }}
        >
          {session.title || 'Untitled'}
        </span>
        <span className="text-xs flex-shrink-0 ml-auto" style={{ color: '#52525b' }}>
          {session.last_active}
        </span>
      </div>
      {session.preview && (
        <p className="text-xs mt-1 truncate" style={{ color: '#52525b' }}>
          {session.preview}
        </p>
      )}
    </div>
  );
}

function InstanceSessions({ instance }: { instance: InstanceOverview }) {
  const sessions = instance.sessions;
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: '#111113', borderColor: '#1f1f23' }}
    >
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: '#1f1f23', background: '#0a0a0b' }}
      >
        <span className="text-xs font-semibold" style={{ color: '#71717a' }}>
          {instance.name}
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm px-4 py-4" style={{ color: '#52525b' }}>
          No recent sessions
        </p>
      ) : (
        <div className="p-3 space-y-1.5">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

type SessionsPanelProps = {
  instances: InstanceOverview[];
};

export function SessionsPanel({ instances }: SessionsPanelProps) {
  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Recent Sessions
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {instances.map((inst) => (
          <InstanceSessions key={inst.name} instance={inst} />
        ))}
      </div>
    </div>
  );
}
