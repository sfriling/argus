import { useEffect, useState } from 'react';
import type { ArgusConfig, ConfigResponse } from '../types';
import { fetchConfig, saveConfig } from './api';
import { SettingsView } from './SettingsView';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function SettingsModal({ open, onClose, onSaved }: Props) {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setLoadError(null);
    setSaveError(null);
    fetchConfig()
      .then(setData)
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, [open]);

  if (!open) return null;

  async function handleSave(cfg: ArgusConfig) {
    setSaving(true);
    setSaveError(null);
    try {
      await saveConfig(cfg);
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl border w-full max-w-2xl mt-12 p-6"
        style={{ background: '#111113', borderColor: '#1f1f23' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loadError ? (
          <div className="text-sm" style={{ color: '#fca5a5' }}>
            Couldn’t load config: {loadError}
            <button onClick={onClose} className="block mt-3 text-xs" style={{ color: '#a1a1aa' }}>
              Close
            </button>
          </div>
        ) : data ? (
          <SettingsView
            data={data}
            onSave={handleSave}
            onClose={onClose}
            saving={saving}
            error={saveError}
          />
        ) : (
          <p className="text-sm" style={{ color: '#52525b' }}>Loading…</p>
        )}
      </div>
    </div>
  );
}
