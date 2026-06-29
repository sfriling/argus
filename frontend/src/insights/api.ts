import type { SessionDetail } from '../types';

export async function fetchSession(instance: string, id: string): Promise<SessionDetail> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(instance)}/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
