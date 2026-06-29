import { useEffect, useState } from 'react';
import type { SessionDetail, SessionMessage } from '../types';
import { fetchSession } from './api';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>{value}</p>
      <p className="text-xs" style={{ color: '#52525b' }}>{label}</p>
    </div>
  );
}

function Message({ m }: { m: SessionMessage }) {
  if (m.role === 'tool') {
    return (
      <details className="rounded-lg" style={{ background: '#0a0a0b' }}>
        <summary className="text-xs px-3 py-2 cursor-pointer font-mono" style={{ color: '#71717a' }}>
          ▸ {m.tool_name || 'tool'} result{m.truncated ? ' (truncated)' : ''}
        </summary>
        <pre className="text-xs px-3 pb-3 overflow-x-auto whitespace-pre-wrap" style={{ color: '#a1a1aa' }}>
          {m.result}
        </pre>
      </details>
    );
  }

  const isUser = m.role === 'user';
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: isUser ? '#11131a' : '#111113' }}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: isUser ? '#6366f1' : '#52525b' }}>
        {isUser ? 'You' : 'Agent'}
      </p>
      {m.text && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: '#d4d4d8', overflowWrap: 'anywhere' }}>{m.text}</p>
      )}
      {m.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {m.tools.map((t, i) => (
            <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ color: '#a78bfa', background: '#a78bfa18' }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionDrawer({
  instance, sessionId, title, onClose,
}: {
  instance: string;
  sessionId: string;
  title?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    (async () => {
      try {
        const d = await fetchSession(instance, sessionId);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instance, sessionId]);

  const meta = data?.meta;
  const cost = meta && meta.cost_usd > 0 ? `$${meta.cost_usd.toFixed(2)}` : '—';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl p-6 overflow-y-auto border-l space-y-4"
        style={{ background: '#0f0f11', borderColor: '#1f1f23' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5', overflowWrap: 'anywhere' }}>
            {meta?.title || title || sessionId}
          </h2>
          <button onClick={onClose} className="text-xs flex-shrink-0" style={{ color: '#a1a1aa' }}>Close</button>
        </div>

        {error && <p className="text-sm" style={{ color: '#fca5a5' }}>Couldn’t load session: {error}</p>}
        {!data && !error && <p className="text-sm" style={{ color: '#52525b' }}>Loading…</p>}

        {meta && (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border p-4"
              style={{ background: '#111113', borderColor: '#1f1f23' }}>
              <Stat label="model" value={meta.model || '—'} />
              <Stat label="turns" value={String(meta.message_count)} />
              <Stat label="tool calls" value={String(meta.tool_call_count)} />
              <Stat label="tokens" value={`${fmtTokens(meta.input_tokens)} / ${fmtTokens(meta.output_tokens)}`} />
              <Stat label="cost" value={cost} />
              <Stat label="outcome" value={meta.end_reason || (meta.ended_at ? 'ended' : 'active')} />
            </div>

            <div className="space-y-2">
              {data!.messages.map((m, i) => <Message key={i} m={m} />)}
              {data!.messages.length === 0 && (
                <p className="text-sm" style={{ color: '#52525b' }}>No messages in this session.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
