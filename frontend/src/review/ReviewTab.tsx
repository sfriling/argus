import { useEffect, useRef, useState } from 'react';
import type { ReviewJob, SkillGap, LedgerIndexEntry, ProposedEdit, ApplyOutcome } from '../types';
import { runReview, fetchStatus, listRuns, proposeEdit, proposeHealthEdit, applyEdit, getRun } from './api';

function elapsed(fromIso: string): string {
  if (!fromIso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function AppliedChip({ outcome }: { outcome: ApplyOutcome }) {
  return (
    <div className="mt-3 text-xs flex items-center gap-2" style={{ color: '#22c55e' }}>
      <span className="px-1.5 py-0.5 rounded-md" style={{ background: '#22c55e18' }}>✓ applied</span>
      {outcome.backup_path && (
        <span style={{ color: '#52525b' }}>backup: <span className="font-mono">{outcome.backup_path}</span></span>
      )}
    </div>
  );
}

function GapCard({ g, index, writebackEnabled, onPrepare, preparing, outcome }:
  { g: SkillGap; index: number; writebackEnabled: boolean; onPrepare: (i: number) => void;
    preparing: boolean; outcome?: ApplyOutcome }) {
  const isNew = g.target_skill.toLowerCase() === 'new';
  const truncated = g.target_skill.includes('…') || g.target_skill.includes('...');
  const isApplied = outcome?.status === 'applied';
  const canApply = writebackEnabled && !isNew && !truncated && !!g.target_skill && !isApplied;
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
      {isApplied && outcome && <AppliedChip outcome={outcome} />}
      {canApply && (
        <button disabled={preparing} onClick={() => onPrepare(index)}
          className="mt-3 text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#0a0a0b', background: preparing ? '#27272a' : '#a78bfa' }}>
          {preparing ? 'Preparing…' : 'Prepare edit'}
        </button>
      )}
    </div>
  );
}

function DiffModal({ instance, proposal, onClose, onApplied }:
  { instance: string; proposal: ProposedEdit; onClose: () => void; onApplied: (o: ApplyOutcome) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackInjection, setAckInjection] = useState(false);
  const hasInjection = proposal.injection_flags.length > 0;

  async function approve() {
    setBusy(true); setError(null);
    try {
      onApplied(await applyEdit(instance, proposal.proposal_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#000000cc' }}>
      <div className="rounded-xl border w-full max-w-3xl max-h-[85vh] flex flex-col"
        style={{ background: '#111113', borderColor: '#27272a' }}>
        <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: '#1f1f23' }}>
          <span className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>{proposal.skill_name}</span>
          <span className="text-xs font-mono ml-2" style={{ color: '#52525b', overflowWrap: 'anywhere' }}>{proposal.path}</span>
          <button onClick={onClose} className="ml-auto text-xs px-2 py-1 rounded" style={{ color: '#a1a1aa' }}>✕</button>
        </div>

        {proposal.warnings.map((w, i) => (
          <p key={i} className="px-4 pt-2 text-xs" style={{ color: '#f59e0b' }}>⚠ {w}</p>
        ))}
        {hasInjection && (
          <div className="m-4 mb-0 rounded-lg p-3" style={{ background: '#7f1d1d22', border: '1px solid #ef444455' }}>
            <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>
              Potentially unsafe content added: {proposal.injection_flags.join(', ')}
            </p>
            <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>
              Skills are executed by the agent. Review the additions carefully.
            </p>
            <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: '#d4d4d8' }}>
              <input type="checkbox" checked={ackInjection} onChange={(e) => setAckInjection(e.target.checked)} />
              I’ve reviewed the flagged additions and want to apply anyway
            </label>
          </div>
        )}

        <pre className="text-xs m-4 rounded-lg p-3 overflow-auto flex-1 whitespace-pre"
          style={{ background: '#0a0a0b' }}>
          {proposal.diff.split('\n').map((line, i) => {
            const c = line.startsWith('+') && !line.startsWith('+++') ? '#22c55e'
              : line.startsWith('-') && !line.startsWith('---') ? '#ef4444'
              : line.startsWith('@@') ? '#38bdf8' : '#71717a';
            return <div key={i} style={{ color: c }}>{line || ' '}</div>;
          })}
        </pre>

        {error && <p className="px-4 text-sm" style={{ color: '#fca5a5' }}>{error}</p>}
        <div className="flex items-center gap-2 p-4 border-t" style={{ borderColor: '#1f1f23' }}>
          <span className="text-xs" style={{ color: '#52525b' }}>A timestamped backup is kept before writing.</span>
          <button onClick={onClose} className="ml-auto text-xs px-3 py-1.5 rounded-lg" style={{ color: '#a1a1aa', background: '#27272a' }}>
            Cancel
          </button>
          <button disabled={busy || (hasInjection && !ackInjection)} onClick={approve}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ color: '#0a0a0b', background: busy || (hasInjection && !ackInjection) ? '#27272a' : '#22c55e' }}>
            {busy ? 'Writing…' : 'Approve & write'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffPre({ diff }: { diff: string }) {
  return (
    <pre className="text-xs rounded-lg p-3 overflow-auto whitespace-pre max-h-48"
      style={{ background: '#0a0a0b' }}>
      {diff.split('\n').map((line, i) => {
        const c = line.startsWith('+') && !line.startsWith('+++') ? '#22c55e'
          : line.startsWith('-') && !line.startsWith('---') ? '#ef4444'
          : line.startsWith('@@') ? '#38bdf8' : '#71717a';
        return <div key={i} style={{ color: c }}>{line || ' '}</div>;
      })}
    </pre>
  );
}

function BatchModal({ instance, proposals, onClose, onDone }:
  { instance: string; proposals: ProposedEdit[]; onClose: () => void;
    onDone: (applied: ProposedEdit[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flagged = proposals.filter((p) => p.injection_flags.length > 0);

  async function writeAll() {
    setBusy(true); setError(null);
    const applied: ProposedEdit[] = [];
    const failed: string[] = [];
    for (const p of proposals) {
      try {
        const o = await applyEdit(instance, p.proposal_id);
        if (o.status === 'applied') applied.push(p);
        else failed.push(`${p.skill_name}: ${o.status}`);
      } catch (e) {
        failed.push(`${p.skill_name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(false);
    if (failed.length) setError(`${applied.length} applied, ${failed.length} failed — ${failed.join('; ')}`);
    onDone(applied);
    if (!failed.length) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#000000cc' }}>
      <div className="rounded-xl border w-full max-w-3xl max-h-[88vh] flex flex-col"
        style={{ background: '#111113', borderColor: '#27272a' }}>
        <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: '#1f1f23' }}>
          <span className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>
            Apply all edits ({proposals.length})
          </span>
          <button onClick={onClose} className="ml-auto text-xs px-2 py-1 rounded" style={{ color: '#a1a1aa' }}>✕</button>
        </div>
        {flagged.length > 0 && (
          <div className="m-4 mb-0 rounded-lg p-3" style={{ background: '#7f1d1d22', border: '1px solid #ef444455' }}>
            <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>
              {flagged.length} edit(s) add potentially unsafe content ({flagged.map((p) => p.skill_name).join(', ')}).
              Skills are executed by the agent — review the diffs below.
            </p>
            <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: '#d4d4d8' }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I’ve reviewed the flagged additions and want to apply all anyway
            </label>
          </div>
        )}
        <div className="overflow-auto flex-1 p-4 space-y-4">
          {proposals.map((p) => (
            <div key={p.proposal_id}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium" style={{ color: '#f4f4f5' }}>{p.skill_name}</span>
                {p.change_note && <span className="text-xs" style={{ color: '#a1a1aa' }}>— {p.change_note}</span>}
                {p.injection_flags.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded ml-auto" style={{ color: '#fca5a5', background: '#ef444418' }}>
                    {p.injection_flags.join(', ')}
                  </span>
                )}
              </div>
              <DiffPre diff={p.diff} />
            </div>
          ))}
        </div>
        {error && <p className="px-4 text-sm" style={{ color: '#fca5a5' }}>{error}</p>}
        <div className="flex items-center gap-2 p-4 border-t" style={{ borderColor: '#1f1f23' }}>
          <span className="text-xs" style={{ color: '#52525b' }}>Each write keeps a timestamped backup.</span>
          <button onClick={onClose} className="ml-auto text-xs px-3 py-1.5 rounded-lg" style={{ color: '#a1a1aa', background: '#27272a' }}>
            Cancel
          </button>
          <button disabled={busy || (flagged.length > 0 && !ack)} onClick={writeAll}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ color: '#0a0a0b', background: busy || (flagged.length > 0 && !ack) ? '#27272a' : '#22c55e' }}>
            {busy ? 'Writing…' : `Approve & write all (${proposals.length})`}
          </button>
        </div>
      </div>
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

export function ReviewTab({ instances, writebackEnabled = false }:
  { instances: string[]; writebackEnabled?: boolean }) {
  const [instance, setInstance] = useState(instances[0] ?? '');
  const [job, setJob] = useState<ReviewJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0); // re-render so the elapsed timer advances
  const [runs, setRuns] = useState<LedgerIndexEntry[]>([]);
  const [proposal, setProposal] = useState<ProposedEdit | null>(null);
  const [preparingKey, setPreparingKey] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, ApplyOutcome>>({});
  const [healthOutcomes, setHealthOutcomes] = useState<Record<number, ApplyOutcome>>({});
  const [batchProposals, setBatchProposals] = useState<ProposedEdit[] | null>(null);
  const [batchPreparing, setBatchPreparing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = job?.status === 'running';
  const report = job?.status === 'done' ? job.report : null;

  // Per-item apply status comes from the LEDGER (server-side), so "applied" survives tab switches and
  // restarts — and an already-applied gap/health item won't offer to fix it again.
  useEffect(() => {
    if (!report?.run_id || report.instance !== instance) { setOutcomes({}); setHealthOutcomes({}); return; }
    let alive = true;
    getRun(instance, report.run_id).then((rec) => {
      if (!alive || !rec) return;
      const g: Record<number, ApplyOutcome> = {};
      rec.gaps.forEach((x, i) => { if (x.outcome) g[i] = x.outcome; });
      setOutcomes(g);
      const h: Record<number, ApplyOutcome> = {};
      (rec.health || []).forEach((x, i) => { if (x.outcome) h[i] = x.outcome; });
      setHealthOutcomes(h);
    }).catch(() => {});
    return () => { alive = false; };
  }, [instance, report?.run_id, report?.instance, refreshNonce]);

  async function prepareItem(kind: 'gap' | 'health', index: number) {
    const rid = report?.run_id;
    if (!rid) return;
    setPreparingKey(`${kind}-${index}`); setError(null);
    try {
      const p = kind === 'health'
        ? await proposeHealthEdit(instance, rid, index)
        : await proposeEdit(instance, rid, index);
      setProposal(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparingKey(null);
    }
  }

  // Items that can still be written (write-back on, real skill, not already applied).
  const gapItems = (report?.gaps ?? []).map((g, i) => ({ i, g })).filter(({ i, g }) =>
    writebackEnabled && !!g.target_skill && g.target_skill.toLowerCase() !== 'new'
    && !g.target_skill.includes('…') && !g.target_skill.includes('...')
    && outcomes[i]?.status !== 'applied');
  const healthItems = (report?.health ?? []).map((h, i) => ({ i, h })).filter(({ i, h }) =>
    writebackEnabled && !!h.skill && !h.skill.includes('…') && !h.skill.includes('...')
    && healthOutcomes[i]?.status !== 'applied');
  const applicableCount = gapItems.length + healthItems.length;

  async function applyAll() {
    const rid = report?.run_id;
    if (!rid) return;
    setBatchPreparing(true); setError(null);
    const props: ProposedEdit[] = [];
    for (const { i } of gapItems) {
      try { props.push(await proposeEdit(instance, rid, i)); } catch { /* skip the ones that fail to propose */ }
    }
    for (const { i } of healthItems) {
      try { props.push(await proposeHealthEdit(instance, rid, i)); } catch { /* skip */ }
    }
    setBatchPreparing(false);
    if (props.length) setBatchProposals(props);
    else setError('Could not prepare any edits.');
  }

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
          <div className="flex items-center gap-3">
            <p className="text-xs" style={{ color: '#3f3f46' }}>
              {report.model} · reviewed {report.sessions_reviewed.length} session(s) on {report.instance}
            </p>
            {writebackEnabled && applicableCount > 1 && (
              <button disabled={batchPreparing} onClick={applyAll}
                className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ color: '#0a0a0b', background: batchPreparing ? '#27272a' : '#22c55e' }}>
                {batchPreparing ? `Preparing ${applicableCount}…` : `Apply all edits (${applicableCount})`}
              </button>
            )}
          </div>

          {report.gaps.length > 0 && (
            <Section label={`Gaps (${report.gaps.length})`}>
              <div className="space-y-3">
                {report.gaps.map((g, i) => (
                  <GapCard key={i} g={g} index={i} writebackEnabled={writebackEnabled}
                    onPrepare={(idx) => prepareItem('gap', idx)}
                    preparing={preparingKey === `gap-${i}`} outcome={outcomes[i]} />
                ))}
              </div>
            </Section>
          )}

          {report.health.length > 0 && (
            <Section label="Skill health">
              <div className="space-y-1.5">
                {report.health.map((h, i) => {
                  const ho = healthOutcomes[i];
                  const fixed = ho?.status === 'applied';
                  const canFix = writebackEnabled && !fixed && !!h.skill
                    && !h.skill.includes('…') && !h.skill.includes('...');
                  return (
                    <div key={i} className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                      style={{ background: '#0a0a0b' }}>
                      <span className="font-mono text-xs flex-shrink-0"
                        style={{ color: h.severity === 'warn' ? '#f59e0b' : '#71717a' }}>{h.skill}</span>
                      <span style={{ color: '#a1a1aa' }}> — {h.finding}</span>
                      {fixed && <span className="ml-auto text-xs flex-shrink-0" style={{ color: '#22c55e' }}>✓ fixed</span>}
                      {canFix && (
                        <button disabled={preparingKey === `health-${i}`} onClick={() => prepareItem('health', i)}
                          className="ml-auto text-xs font-medium px-2 py-1 rounded-md flex-shrink-0"
                          style={{ color: '#0a0a0b', background: preparingKey === `health-${i}` ? '#27272a' : '#a78bfa' }}>
                          {preparingKey === `health-${i}` ? 'Preparing…' : 'Fix'}
                        </button>
                      )}
                    </div>
                  );
                })}
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

      {proposal && (
        <DiffModal
          instance={instance}
          proposal={proposal}
          onClose={() => setProposal(null)}
          onApplied={(o) => {
            if (o.status === 'applied') {
              const setter = proposal.kind === 'health' ? setHealthOutcomes : setOutcomes;
              setter((m) => ({ ...m, [proposal.gap_index]: o }));         // optimistic
              setRefreshNonce((n) => n + 1);                              // reconcile from the ledger
            }
            setProposal(null);
          }}
        />
      )}

      {batchProposals && (
        <BatchModal
          instance={instance}
          proposals={batchProposals}
          onClose={() => setBatchProposals(null)}
          onDone={(applied) => {
            applied.forEach((p) => {
              const o: ApplyOutcome = { gap_index: p.gap_index, status: 'applied', path: p.path,
                backup_path: '', new_sha256: '', applied_at: '', error: '' };
              const setter = p.kind === 'health' ? setHealthOutcomes : setOutcomes;
              setter((m) => ({ ...m, [p.gap_index]: o }));
            });
            setRefreshNonce((n) => n + 1);   // reconcile (backup paths etc.) from the ledger
          }}
        />
      )}
    </div>
  );
}
