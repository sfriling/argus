import { useEffect, useState } from 'react';
import type { BoardTask } from '../types';
import { fetchTask } from './api';
import { cardActions } from './columns';

const VERB_LABEL: Record<string, string> = {
  promote: 'Promote', block: 'Block', unblock: 'Unblock', complete: 'Complete',
};

function commentsFrom(detail: Record<string, unknown> | null): { author: string; body: string }[] {
  if (!detail) return [];
  const raw = (detail.comments ?? detail.posts ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      author: String(c.author ?? c.created_by ?? c.profile ?? ''),
      body: String(c.body ?? c.text ?? c.content ?? ''),
    }))
    .filter((c) => c.body);
}

export function TaskDrawer({
  instance,
  task,
  writable,
  profiles,
  onAction,
  onClose,
  busy,
  error,
}: {
  instance: string;
  task: BoardTask;
  writable: boolean;
  profiles: string[];
  onAction: (verb: string, args?: Record<string, unknown>) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [comment, setComment] = useState('');
  const [assignee, setAssignee] = useState(task.assignee ?? '');
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    fetchTask(instance, task.id).then(setDetail).catch(() => setDetail(null));
  }, [instance, task.id]);

  const comments = commentsFrom(detail);
  const body = String((detail?.body as string) ?? task.body ?? '');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="h-full w-full max-w-md p-6 overflow-y-auto border-l space-y-4"
        style={{ background: '#0f0f11', borderColor: '#1f1f23' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>{task.title}</h2>
          <button onClick={onClose} className="text-xs" style={{ color: '#a1a1aa' }}>Close</button>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#71717a' }}>
          <span className="font-mono">{task.id}</span>
          <span>·</span><span>{task.status}</span>
          {task.assignee && (<><span>·</span><span>@{task.assignee}</span></>)}
        </div>

        {body && <p className="text-sm whitespace-pre-wrap" style={{ color: '#a1a1aa' }}>{body}</p>}

        {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}

        {/* Comments */}
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#52525b' }}>
            Comments {comments.length ? `(${comments.length})` : ''}
          </p>
          <div className="space-y-2">
            {comments.map((c, i) => (
              <div key={i} className="rounded-lg px-3 py-2" style={{ background: '#0a0a0b' }}>
                {c.author && <p className="text-xs font-mono mb-0.5" style={{ color: '#71717a' }}>{c.author}</p>}
                <p className="text-sm" style={{ color: '#d4d4d8' }}>{c.body}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-xs" style={{ color: '#3f3f46' }}>No comments yet.</p>}
          </div>
        </div>

        {!writable ? (
          <p className="text-xs rounded-lg p-3" style={{ background: '#1f1f23', color: '#d4d4d8' }}>
            Read-only. Set <code>enable_actions: true</code> (localhost) to comment and act.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Add comment */}
            <div className="flex gap-2">
              <input
                className="flex-1 text-sm rounded-md px-2 py-1.5 border bg-transparent outline-none"
                style={{ background: '#0a0a0b', borderColor: '#27272a', color: '#e4e4e7' }}
                placeholder="Add a comment…" value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button
                disabled={!comment.trim() || busy}
                onClick={() => { onAction('comment', { body: comment.trim() }); setComment(''); }}
                className="text-sm px-3 py-1.5 rounded-md font-medium"
                style={{ color: '#0a0a0b', background: comment.trim() ? '#3b82f6' : '#27272a' }}
              >Send</button>
            </div>

            {/* Assign */}
            <div className="flex gap-2">
              <select
                className="flex-1 text-sm rounded-md px-2 py-1.5 border bg-transparent outline-none"
                style={{ background: '#0a0a0b', borderColor: '#27272a', color: '#e4e4e7' }}
                value={assignee} onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">(assignee)</option>
                {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                disabled={!assignee || assignee === task.assignee || busy}
                onClick={() => onAction('assign', { assignee })}
                className="text-sm px-3 py-1.5 rounded-md" style={{ color: '#a1a1aa', background: '#27272a' }}
              >Assign</button>
            </div>

            {/* Transition + archive buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {cardActions(task.status).map((v) => (
                <button key={v} disabled={busy} onClick={() => onAction(v)}
                  className="text-sm px-3 py-1.5 rounded-md font-medium"
                  style={{ color: '#0a0a0b', background: '#22c55e' }}>
                  {VERB_LABEL[v] ?? v}
                </button>
              ))}
              {!confirmArchive ? (
                <button disabled={busy} onClick={() => setConfirmArchive(true)}
                  className="text-sm px-3 py-1.5 rounded-md ml-auto"
                  style={{ color: '#ef4444', background: '#ef444418' }}>Archive</button>
              ) : (
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#a1a1aa' }}>Archive?</span>
                  <button onClick={() => setConfirmArchive(false)} className="text-sm px-2 py-1.5 rounded-md"
                    style={{ color: '#a1a1aa', background: '#27272a' }}>No</button>
                  <button disabled={busy} onClick={() => onAction('archive')}
                    className="text-sm px-2 py-1.5 rounded-md font-medium"
                    style={{ color: '#0a0a0b', background: '#ef4444' }}>Yes</button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
