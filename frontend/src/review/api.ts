import type { ReviewJob, LedgerIndexEntry } from '../types';

/** Past review runs for an instance (newest first), from the persistent ledger. */
export async function listRuns(instance: string): Promise<LedgerIndexEntry[]> {
  const res = await fetch(`/api/skill-review/${encodeURIComponent(instance)}/runs`);
  if (!res.ok) return [];
  return res.json();
}

/** Start a review. Returns the job in its initial "running" state (the work
 *  continues server-side). Throws on 403 (disabled) / 409 (already running). */
export async function runReview(instance: string): Promise<ReviewJob> {
  const res = await fetch(`/api/skill-review/${encodeURIComponent(instance)}/run`, { method: 'POST' });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail);
    } catch {
      /* keep status */
    }
    throw new Error(detail);
  }
  return res.json();
}

/** Server-side status of the most recent / in-flight review. Survives reloads. */
export async function fetchStatus(): Promise<ReviewJob | null> {
  const res = await fetch('/api/skill-review/status');
  if (!res.ok) return null;
  return res.json();
}
