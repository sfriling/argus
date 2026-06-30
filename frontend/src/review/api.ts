import type { ReviewJob, LedgerIndexEntry, ProposedEdit, ApplyOutcome, LedgerRecord } from '../types';

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = String(b.detail); } catch { /* keep */ }
    throw new Error(detail);
  }
  return res.json();
}

/** Generate a proposed full-file rewrite for a gap (nothing is written). */
export function proposeEdit(instance: string, run_id: string, gap_index: number): Promise<ProposedEdit> {
  return postJson(`/api/skill-review/${encodeURIComponent(instance)}/propose-edit`, { run_id, gap_index });
}

/** Apply a previously-proposed edit (the server writes its own stored bytes). */
export function applyEdit(instance: string, proposal_id: string): Promise<ApplyOutcome> {
  return postJson(`/api/skill-review/${encodeURIComponent(instance)}/apply-edit`, { proposal_id });
}

/** Past review runs for an instance (newest first), from the persistent ledger. */
export async function listRuns(instance: string): Promise<LedgerIndexEntry[]> {
  const res = await fetch(`/api/skill-review/${encodeURIComponent(instance)}/runs`);
  if (!res.ok) return [];
  return res.json();
}

/** A single run's full record, incl. per-gap apply outcomes (survives navigation/restart). */
export async function getRun(instance: string, runId: string): Promise<LedgerRecord | null> {
  const res = await fetch(`/api/skill-review/${encodeURIComponent(instance)}/runs/${encodeURIComponent(runId)}`);
  if (!res.ok) return null;
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
