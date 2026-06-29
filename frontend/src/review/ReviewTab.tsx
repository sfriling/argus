import { useEffect, useState } from 'react';
import type { ReviewReport, SkillGap } from '../types';
import { runReview, fetchReport } from './api';

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
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReport().then(setReport).catch(() => {});
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setReport(await runReview(instance));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        <button disabled={busy} onClick={run}
          className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#0a0a0b', background: busy ? '#27272a' : '#22c55e' }}>
          {busy ? 'Reviewing…' : 'Run review'}
        </button>
      </div>

      <p className="text-xs" style={{ color: '#52525b' }}>
        Triages the sessions that struggled, has Claude review them against your skills, and proposes
        edits. Read-only — nothing is changed. (Uses your Claude Code subscription, or an Anthropic
        API key if set; a run costs a few cents.)
      </p>

      {error && <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>}
      {busy && !error && <p className="text-sm" style={{ color: '#52525b' }}>Reviewing recent sessions…</p>}

      {report && (
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

      {!report && !busy && !error && (
        <p className="text-sm" style={{ color: '#52525b' }}>No review yet. Click “Run review” to start.</p>
      )}
    </div>
  );
}
