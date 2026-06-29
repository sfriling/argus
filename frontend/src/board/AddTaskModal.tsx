import { useState } from 'react';

const FIELD = 'w-full text-sm rounded-md px-2 py-1.5 border bg-transparent outline-none';
const FIELD_STYLE = { background: '#0a0a0b', borderColor: '#27272a', color: '#e4e4e7' };

export function AddTaskModal({
  profiles,
  onCreate,
  onClose,
  busy,
  error,
}: {
  profiles: string[];
  onCreate: (args: { title: string; body?: string; assignee?: string }) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState(''); // default unassigned → stages, won't run

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl border w-full max-w-md mt-20 p-6 space-y-4"
        style={{ background: '#111113', borderColor: '#1f1f23' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>New task</h2>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: '#52525b' }}>Title</span>
          <input className={FIELD} style={FIELD_STYLE} value={title} autoFocus
            onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: '#52525b' }}>Body (optional)</span>
          <textarea className={FIELD} style={{ ...FIELD_STYLE, minHeight: 80 }} value={body}
            onChange={(e) => setBody(e.target.value)} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: '#52525b' }}>Assignee</span>
          <select className={FIELD} style={FIELD_STYLE} value={assignee}
            onChange={(e) => setAssignee(e.target.value)}>
            <option value="">(unassigned — stage it)</option>
            {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-xs" style={{ color: '#52525b' }}>
            Unassigned tasks wait in Ready without running. Assign one (here or from its card) to start it.
          </span>
        </label>

        {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md"
            style={{ color: '#a1a1aa', background: '#27272a' }}>Cancel</button>
          <button
            disabled={!title.trim() || busy}
            onClick={() => onCreate({ title: title.trim(), body: body.trim() || undefined, assignee: assignee || undefined })}
            className="text-sm px-3 py-1.5 rounded-md font-medium"
            style={{ color: '#0a0a0b', background: title.trim() ? '#22c55e' : '#27272a' }}
          >
            {busy ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}
