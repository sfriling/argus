import type { BoardTask } from '../types';

export const COLUMNS = ['todo', 'ready', 'running', 'blocked', 'review', 'done'] as const;
export type ColumnKey = (typeof COLUMNS)[number];

export const COLUMN_LABEL: Record<ColumnKey, string> = {
  todo: 'Todo',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
};

const STATUS_TO_COLUMN: Record<string, ColumnKey> = {
  triage: 'todo',
  todo: 'todo',
  ready: 'ready',
  scheduled: 'ready',
  running: 'running',
  blocked: 'blocked',
  review: 'review',
  done: 'done',
};

/** The board column a task lives in, or null if it shouldn't show (archived). */
export function columnFor(status: string): ColumnKey | null {
  if (status === 'archived') return null;
  return STATUS_TO_COLUMN[status] ?? 'todo';
}

export function groupByColumn(tasks: BoardTask[]): Record<ColumnKey, BoardTask[]> {
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as BoardTask[]])) as Record<
    ColumnKey,
    BoardTask[]
  >;
  for (const t of tasks) {
    const c = columnFor(t.status);
    if (c) out[c].push(t);
  }
  return out;
}

/**
 * The `hermes kanban` verb for dragging a task from its status to a target column,
 * or null if the move isn't human-driven (→ running is the dispatcher's job; → todo /
 * review have no clean human verb) or is a no-op (same column). The CLI is the final
 * arbiter — an accepted verb that the engine rejects surfaces as an error toast.
 */
export function dragVerb(fromStatus: string, toColumn: ColumnKey): string | null {
  if (columnFor(fromStatus) === toColumn) return null; // dropped back in place
  switch (toColumn) {
    case 'ready':
      return fromStatus === 'blocked' || fromStatus === 'scheduled' ? 'unblock' : 'promote';
    case 'blocked':
      return 'block';
    case 'done':
      return 'complete';
    default:
      return null; // running / todo / review
  }
}

/** Contextual transition buttons to show in a task's drawer, by its current status. */
export function cardActions(status: string): string[] {
  switch (status) {
    case 'triage':
    case 'todo':
      return ['promote', 'block'];
    case 'ready':
      return ['block'];
    case 'scheduled':
    case 'blocked':
      return ['unblock'];
    case 'running':
    case 'review':
      return ['complete'];
    default:
      return []; // done / archived
  }
}
