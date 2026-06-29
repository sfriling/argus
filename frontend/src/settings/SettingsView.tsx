import { useState } from 'react';
import type { ArgusConfig, ConfigInstance, ConfigResponse } from '../types';

const FIELD =
  'w-full text-sm rounded-md px-2 py-1.5 border bg-transparent outline-none';
const FIELD_STYLE = { background: '#0a0a0b', borderColor: '#27272a', color: '#e4e4e7' };
const LABEL = 'text-xs uppercase tracking-wider';
const LABEL_STYLE = { color: '#52525b' };

function blankInstance(): ConfigInstance {
  return { name: '', transport: 'local', profile: 'orchestrator', hermes_home: '', hermes_bin: 'hermes' };
}

type Props = {
  data: ConfigResponse;
  onSave: (config: ArgusConfig) => void;
  onClose: () => void;
  saving?: boolean;
  error?: string | null;
};

export function SettingsView({ data, onSave, onClose, saving, error }: Props) {
  const writable = data.meta.writable;
  const [cfg, setCfg] = useState<ArgusConfig>(() => structuredClone(data.config));
  const [confirming, setConfirming] = useState(false);

  function patch(p: Partial<ArgusConfig>) {
    setCfg((c) => ({ ...c, ...p }));
    setConfirming(false);
  }
  function patchInstance(i: number, p: Partial<ConfigInstance>) {
    setCfg((c) => {
      const instances = c.instances.map((inst, j) => (j === i ? { ...inst, ...p } : inst));
      return { ...c, instances };
    });
    setConfirming(false);
  }
  function addInstance() {
    setCfg((c) => ({ ...c, instances: [...c.instances, blankInstance()] }));
    setConfirming(false);
  }
  function removeInstance(i: number) {
    setCfg((c) => ({ ...c, instances: c.instances.filter((_, j) => j !== i) }));
    setConfirming(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>
          Settings
        </h2>
        <button onClick={onClose} className="text-xs px-2 py-1 rounded" style={{ color: '#a1a1aa' }}>
          Close
        </button>
      </div>

      <p className="text-xs mb-1" style={{ color: '#52525b' }}>
        Config file
      </p>
      <p className="text-xs font-mono mb-4 break-all" style={{ color: '#a1a1aa' }}>
        {data.meta.path}
      </p>

      {!writable && (
        <div
          className="rounded-lg p-3 mb-4 text-xs"
          style={{ background: '#1f1f23', color: '#d4d4d8' }}
        >
          Read-only. To edit from here, set <code>enable_config_writes: true</code> in the
          config and keep Argus bound to localhost
          {data.meta.localhost_bound ? '' : ' (it is currently bound beyond localhost)'}, then
          restart. You can always edit the file directly or use the <code>argus</code> CLI.
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: '#3f1d1d', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Scalar settings */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <label className="space-y-1">
          <span className={LABEL} style={LABEL_STYLE}>Port</span>
          <input
            className={FIELD} style={FIELD_STYLE} type="number" disabled={!writable}
            value={cfg.port}
            onChange={(e) => patch({ port: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <span className={LABEL} style={LABEL_STYLE}>Refresh (s)</span>
          <input
            className={FIELD} style={FIELD_STYLE} type="number" disabled={!writable}
            value={cfg.refresh_seconds}
            onChange={(e) => patch({ refresh_seconds: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1 col-span-2">
          <span className={LABEL} style={LABEL_STYLE}>Claude home</span>
          <input
            className={FIELD} style={FIELD_STYLE} disabled={!writable}
            value={cfg.claude_home}
            onChange={(e) => patch({ claude_home: e.target.value })}
          />
        </label>
      </div>

      {/* Instances */}
      <div className="flex items-center justify-between mb-2">
        <span className={LABEL} style={LABEL_STYLE}>Instances</span>
        {writable && (
          <button
            onClick={addInstance}
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: '#22c55e', background: '#22c55e18' }}
          >
            + Add
          </button>
        )}
      </div>

      <div className="space-y-3 mb-5">
        {cfg.instances.map((inst, i) => (
          <div key={i} className="rounded-lg p-3" style={{ background: '#0a0a0b' }}>
            <div className="flex items-center gap-2 mb-2">
              <input
                className={FIELD} style={FIELD_STYLE} placeholder="name" disabled={!writable}
                value={inst.name}
                onChange={(e) => patchInstance(i, { name: e.target.value })}
              />
              <select
                className={FIELD} style={FIELD_STYLE} disabled={!writable}
                value={inst.transport}
                onChange={(e) => patchInstance(i, { transport: e.target.value as 'local' | 'ssh' })}
              >
                <option value="local">local</option>
                <option value="ssh">ssh</option>
              </select>
              {writable && (
                <button
                  onClick={() => removeInstance(i)}
                  className="text-xs px-2 py-1 rounded flex-shrink-0"
                  style={{ color: '#ef4444', background: '#ef444418' }}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={FIELD} style={FIELD_STYLE} placeholder="profile" disabled={!writable}
                value={inst.profile ?? ''}
                onChange={(e) => patchInstance(i, { profile: e.target.value })}
              />
              <input
                className={FIELD} style={FIELD_STYLE} placeholder="hermes_home" disabled={!writable}
                value={inst.hermes_home ?? ''}
                onChange={(e) => patchInstance(i, { hermes_home: e.target.value })}
              />
              {inst.transport === 'ssh' && (
                <>
                  <input
                    className={FIELD} style={FIELD_STYLE} placeholder="ssh (user@host)" disabled={!writable}
                    value={inst.ssh ?? ''}
                    onChange={(e) => patchInstance(i, { ssh: e.target.value })}
                  />
                  <input
                    className={FIELD} style={FIELD_STYLE} placeholder="ssh_key path" disabled={!writable}
                    value={inst.ssh_key ?? ''}
                    onChange={(e) => patchInstance(i, { ssh_key: e.target.value })}
                  />
                </>
              )}
            </div>
          </div>
        ))}
        {cfg.instances.length === 0 && (
          <p className="text-xs" style={{ color: '#52525b' }}>No instances configured.</p>
        )}
      </div>

      {writable && (
        <div className="flex items-center justify-end gap-2">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="text-sm px-3 py-1.5 rounded-md font-medium"
              style={{ color: '#0a0a0b', background: '#22c55e' }}
            >
              Save changes
            </button>
          ) : (
            <>
              <span className="text-xs" style={{ color: '#a1a1aa' }}>
                Write this to {data.meta.path}?
              </span>
              <button
                onClick={() => setConfirming(false)}
                className="text-sm px-3 py-1.5 rounded-md"
                style={{ color: '#a1a1aa', background: '#27272a' }}
              >
                Cancel
              </button>
              <button
                onClick={() => onSave(cfg)}
                disabled={saving}
                className="text-sm px-3 py-1.5 rounded-md font-medium"
                style={{ color: '#0a0a0b', background: '#22c55e' }}
              >
                {saving ? 'Saving…' : 'Confirm save'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
