import type { ArgusConfig, ConfigResponse } from '../types';

export async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveConfig(config: ArgusConfig): Promise<void> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      // ignore parse errors, keep the status-based message
    }
    throw new Error(detail);
  }
}
