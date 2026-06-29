import { useCallback, useEffect, useState } from 'react';
import type { BoardResponse, BoardTask } from '../types';
import { fetchBoard, doAction } from './api';
import { COLUMNS, COLUMN_LABEL, type ColumnKey, dragVerb, groupByColumn } from './columns';
import { AddTaskModal } from './AddTaskModal';
import { TaskDrawer } from './TaskDrawer';

const STATUS_COLOR: Record<string, string> = {
  running: '#3b82f6', blocked: '#f59e0b', done: '#22c55e', review: '#a78bfa',
};

function TaskCard({
  task, writable, onOpen,
}: { task: BoardTask; writable: boolean; onOpen: () => void }) {
  return (
    <div
      draggable={writable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, status: task.status }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      className="rounded-lg px-3 py-2.5 cursor-pointer"
      style={{ background: '#111113', border: '1px solid #1f1f23' }}
    >
      <p className="text-sm" style={{ color: '#f4f4f5', overflowWrap: 'anywhere' }}>{task.title}</p>
      <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: '#52525b' }}>
        {task.assignee && <span className="font-mono">@{task.assignee}</span>}
        <span className="ml-auto" style={{ color: STATUS_COLOR[task.status] ?? '#52525b' }}>{task.status}</span>
      </div>
    </div>
  );
}

export function BoardTab({ instances }: { instances: string[] }) {
  const [instance, setInstance] = useState(instances[0] ?? '');
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoardTask | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  };

  const load = useCallback(async (inst: string) => {
    if (!inst) return;
    try {
      setBoard(await fetchBoard(inst));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load(instance);
    const id = setInterval(() => load(instance), 8000);
    return () => clearInterval(id);
  }, [instance, load]);

  const writable = board?.meta.writable ?? false;
  const profiles = board?.meta.profiles ?? [];

  async function act(verb: string, taskId: string | null, args: Record<string, unknown> = {}) {
    setBusy(true);
    setActionError(null);
    try {
      await doAction(instance, verb, taskId, args);
      await load(instance);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
      flash(msg);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(toColumn: ColumnKey, e: React.DragEvent) {
    e.preventDefault();
    if (!writable) return;
    let payload: { id: string; status: string };
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    const verb = dragVerb(payload.status, toColumn);
    if (!verb) {
      flash(
        toColumn === 'running'
          ? 'The dispatcher moves tasks into Running.'
          : "That's not a move you can make by hand here.",
      );
      return;
    }
    act(verb, payload.id);
  }

  const grouped = groupByColumn(board?.tasks ?? []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#52525b', letterSpacing: '0.1em' }}>
          Board
        </h2>
        {instances.length > 1 && (
          <select
            value={instance} onChange={(e) => setInstance(e.target.value)}
            className="text-xs rounded-md px-2 py-1 border bg-transparent outline-none"
            style={{ background: '#0a0a0b', borderColor: '#27272a', color: '#a1a1aa' }}
          >
            {instances.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-3">
          {!writable && (
            <span className="text-xs" style={{ color: '#52525b' }}>read-only</span>
          )}
          <button
            disabled={!writable}
            onClick={() => setAddOpen(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ color: writable ? '#0a0a0b' : '#52525b', background: writable ? '#22c55e' : '#1f1f23' }}
          >
            + Add task
          </button>
        </div>
      </div>

      {error && <p className="text-sm mb-4" style={{ color: '#fca5a5' }}>Couldn’t load board: {error}</p>}

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(0,1fr))` }}>
        {COLUMNS.map((col) => (
          <div
            key={col}
            onDragOver={(e) => writable && e.preventDefault()}
            onDrop={(e) => onDrop(col, e)}
            className="rounded-xl border p-2 min-h-[120px]"
            style={{ background: '#0a0a0b', borderColor: '#1f1f23' }}
          >
            <p className="text-xs font-medium uppercase tracking-wider px-1 pb-2 flex items-center justify-between" style={{ color: '#52525b' }}>
              {COLUMN_LABEL[col]}
              <span style={{ color: '#3f3f46' }}>{grouped[col].length}</span>
            </p>
            <div className="space-y-2">
              {grouped[col].map((t) => (
                <TaskCard key={t.id} task={t} writable={writable} onOpen={() => setSelected(t)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg px-4 py-2 text-sm"
          style={{ background: '#1f1f23', color: '#f4f4f5', border: '1px solid #3f3f46' }}>
          {toast}
        </div>
      )}

      {addOpen && (
        <AddTaskModal
          profiles={profiles}
          busy={busy}
          error={actionError}
          onClose={() => { setAddOpen(false); setActionError(null); }}
          onCreate={async (args) => {
            if (await act('create', null, args)) setAddOpen(false);
          }}
        />
      )}

      {selected && (
        <TaskDrawer
          instance={instance}
          task={selected}
          writable={writable}
          profiles={profiles}
          busy={busy}
          error={actionError}
          onClose={() => { setSelected(null); setActionError(null); }}
          onAction={async (verb, args) => {
            const ok = await act(verb, selected.id, args ?? {});
            // close the drawer after a state transition (not after comment/assign)
            if (ok && ['promote', 'block', 'unblock', 'complete', 'archive'].includes(verb)) {
              setSelected(null);
            }
          }}
        />
      )}
    </div>
  );
}
