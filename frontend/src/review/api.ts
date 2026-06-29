import type { ReviewReport } from '../types';

export async function runReview(instance: string): Promise<ReviewReport> {
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

export async function fetchReport(): Promise<ReviewReport | null> {
  const res = await fetch('/api/skill-review/report');
  if (!res.ok) return null;
  return res.json(); // server returns null when there's no cached report
}
