import { useEffect, useRef, useState } from 'react';
import type { ReviewJob, SkillGap, LedgerIndexEntry } from '../types';
import { runReview, fetchStatus, listRuns } from './api';

function elapsed(fromIso: string): string {
  if (!fromIso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function GapCard({ g }: { g: SkillGap }) {
  const isNew = g.target_skill.toLowerCase() === 'new';
  return (
    <div className="rounded-xl border p-4" style={{ background: '#111113', borderColor: '#1f1f23' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold" style={{ color: '#f4f4f5', overflowWrap: 'anywhere' }}>{g.title}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0"
          style={{ color: isNew ? '#22c55e' : '#a78bfa', background: isNew ? '#22c55e18' : '#a78bfa18' }}>
          {isNew ? 'new skill' : `harden: ${g.target_skill}`}
        </span>
      </div>
      {g.evidence && <p className="text-xs mb-2" style={{ color: '#71717a' }}>Evidence: {g.evidence}</p>}
      {g.recommendation && <p className="text-sm mb-2" style={{ color: '#a1a1aa' }}>{g.recommendation}</p>}
      {g.suggested_edit && (
        <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap"
          style={{ background: '#0a0a0b', color: '#d4d4d8' }}>{g.suggested_edit}</pre>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#52525b' }}>{label}</p>
      {children}
    </div>
  );
}

export function ReviewTab({ instances }: { instances: string[] }) {
  const [instance, setInstance] = useState(instances[0] ?? '');
  const [job, setJob] = useState<ReviewJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0); // re-render so the elapsed timer advances
  const [runs, setRuns] = useState<LedgerIndexEntry[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = job?.status === 'running';

  // Past reviews come from the persistent ledger — reload on instance change and when a run finishes.
  useEffect(() => {
    listRuns(instance).then(setRuns).catch(() => {});
  }, [instance, job?.status]);

  // Hydrate from server-side job state on mount + while a run is in flight,
  // so an in-progress review shows up even after navigating away and back.
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const j = await fetchStatus().catch(() => null);
      if (!alive || !j) return;
      setJob(j);
      if (j.status === 'error') setError(j.error || 'review failed');
    };
    sync();
    pollRef.current = setInterval(() => {
      // poll fast while running (to catch completion), slowly otherwise
      sync();
      tick((n) => n + 1); // keep the elapsed counter live
    }, 2000);
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function run() {
    setError(null);
    try {
      setJob(await runReview(instance));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const report = job?.status === 'done' ? job.report : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#52525b', letterSpacing: '0.1em' }}>
          Skill Review
        </h2>
        {instances.length > 1 && (
          <select value={instance} onChange={(e) => setInstance(e.target.value)}
            className="text-xs rounded-md px-2 py-1 border bg-transparent outline-none"
            style={{ background: '#0a0a0b', borderColor: '#27272a', color: '#a1a1aa' }}>
            {instances.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        )}
        <button disabled={running} onClick={run}
          className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#0a0a0b', background: running ? '#27272a' : '#22c55e' }}>
          {running ? 'Reviewing…' : 'Run review'}
        </button>
      </div>

      <p className="text-xs" style={{ color: '#52525b' }}>
        Triages the sessions that struggled, has Claude review them against your skills, and proposes
        edits. Read-only — nothing is changed. (Uses your Claude Code subscription, or an Anthropic
        API key if set; a run costs a few cents.)
      </p>

      {/* in-progress banner, driven by server-side job state so it survives tab switches */}
      {running && (
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
          style={{ background: '#0a0a0b', border: '1px solid #1f1f23' }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
          <span className="text-sm" style={{ color: '#d4d4d8' }}>
            Reviewing <span style={{ color: '#f4f4f5' }}>{job?.instance}</span>…
          </span>
          <span className="text-xs ml-auto font-mono" style={{ color: '#52525b' }}>{elapsed(job?.started_at ?? '')}</span>
        </div>
      )}

      {error && !running && <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>}

      {/* only show a report that belongs to the selected instance */}
      {report && report.instance === instance && (
        <>
          <p className="text-sm" style={{ color: '#d4d4d8' }}>{report.summary}</p>
          <p className="text-xs" style={{ color: '#3f3f46' }}>
            {report.model} · reviewed {report.sessions_reviewed.length} session(s) on {report.instance}
          </p>

          {report.gaps.length > 0 && (
            <Section label={`Gaps (${report.gaps.length})`}>
              <div className="space-y-3">
                {report.gaps.map((g, i) => <GapCard key={i} g={g} />)}
              </div>
            </Section>
          )}

          {report.health.length > 0 && (
            <Section label="Skill health">
              <div className="space-y-1.5">
                {report.health.map((h, i) => (
                  <div key={i} className="rounded-lg px-3 py-2 text-sm" style={{ background: '#0a0a0b' }}>
                    <span className="font-mono text-xs" style={{ color: h.severity === 'warn' ? '#f59e0b' : '#71717a' }}>{h.skill}</span>
                    <span style={{ color: '#a1a1aa' }}> — {h.finding}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {report.drift.length > 0 && (
            <Section label="Fleet skill drift">
              <div className="space-y-1.5">
                {report.drift.map((d, i) => (
                  <div key={i} className="rounded-lg px-3 py-2 text-sm" style={{ background: '#0a0a0b' }}>
                    <span style={{ color: '#f4f4f5' }}>{d.concern}</span>
                    {d.detail && <span className="text-xs" style={{ color: '#52525b' }}> — {d.detail}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {(!report || report.instance !== instance) && !running && !error && (
        <p className="text-sm" style={{ color: '#52525b' }}>
          No review for <span style={{ color: '#a1a1aa' }}>{instance}</span> yet. Click “Run review” to start.
        </p>
      )}

      {runs.length > 0 && (
        <Section label="Past reviews">
          <div className="space-y-1.5">
            {runs.map((r) => (
              <div key={r.run_id} className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                style={{ background: '#0a0a0b' }}>
                <span className="text-xs px-1.5 py-0.5 rounded-md"
                  style={{ color: r.trigger === 'scheduled' ? '#38bdf8' : '#a1a1aa', background: '#ffffff10' }}>
                  {r.trigger}
                </span>
                <span style={{ color: '#a1a1aa' }}>{r.gap_count} gaps · {r.applied_count} applied</span>
                <span className="ml-auto text-xs font-mono" style={{ color: '#3f3f46' }}>{r.run_id}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
