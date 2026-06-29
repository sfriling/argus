import type { BoardResponse, BoardTask } from '../types';

export async function fetchBoard(instance: string): Promise<BoardResponse> {
  const res = await fetch(`/api/kanban/${encodeURIComponent(instance)}/board`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTask(instance: string, id: string): Promise<BoardTask & Record<string, unknown>> {
  const res = await fetch(`/api/kanban/${encodeURIComponent(instance)}/task/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function doAction(
  instance: string,
  verb: string,
  task_id: string | null,
  args: Record<string, unknown> = {},
): Promise<void> {
  const res = await fetch(`/api/kanban/${encodeURIComponent(instance)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verb, task_id, args }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail);
    } catch {
      /* keep status message */
    }
    throw new Error(detail);
  }
}
