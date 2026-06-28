import type { InstanceOverview } from '../types';

function ProfileChip({
  name,
  active,
}: {
  name: string;
  active: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={
        active
          ? {
              background: '#3b82f618',
              color: '#3b82f6',
              border: '1px solid #3b82f630',
            }
          : {
              background: '#1f1f23',
              color: '#71717a',
              border: '1px solid transparent',
            }
      }
    >
      {active && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#3b82f6' }}
        />
      )}
      {name}
    </span>
  );
}

function InstanceProfiles({ instance }: { instance: InstanceOverview }) {
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
      </div>

      <div className="flex flex-wrap gap-2">
        {instance.profiles.map((profile) => (
          <ProfileChip
            key={profile}
            name={profile}
            active={profile === instance.active_profile}
          />
        ))}
        {instance.profiles.length === 0 && (
          <span className="text-sm" style={{ color: '#52525b' }}>
            No profiles configured
          </span>
        )}
      </div>
    </div>
  );
}

type ProfilesPanelProps = {
  instances: InstanceOverview[];
};

export function ProfilesPanel({ instances }: ProfilesPanelProps) {
  return (
    <div>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: '#52525b', letterSpacing: '0.1em' }}
      >
        Profiles
      </h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {instances.map((inst) => (
          <InstanceProfiles key={inst.name} instance={inst} />
        ))}
      </div>
    </div>
  );
}
