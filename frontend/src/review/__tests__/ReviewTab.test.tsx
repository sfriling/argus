import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ReviewTab } from '../ReviewTab';
import * as api from '../api';
import type { ReviewReport, ReviewJob } from '../../types';

vi.mock('../api');

const report: ReviewReport = {
  generated_at: '', instance: 'local', model: 'claude-opus-4-8', sessions_reviewed: ['s1'],
  run_id: '20260630T120000Z', trigger: 'manual',
  summary: 'Found a patch gap.',
  gaps: [{
    title: 'Patch loop', evidence: 'session s1', recommendation: 'harden the obsidian skill',
    target_skill: 'obsidian', suggested_edit: '## Patch checklist\nreplace needs old_string',
  }],
  health: [{ skill: 'obsidian', finding: 'subtle append guidance', severity: 'warn' }],
  drift: [{ concern: "'hermes-cron' is not on every instance", detail: 'present on local' }],
};

const doneJob: ReviewJob = {
  status: 'done', instance: 'local', started_at: '', finished_at: '', error: '', report,
};
const runningJob: ReviewJob = {
  status: 'running', instance: 'local', started_at: new Date().toISOString(),
  finished_at: '', error: '', report: null,
};

beforeEach(() => {
  vi.mocked(api.fetchStatus).mockResolvedValue(doneJob);
  vi.mocked(api.runReview).mockResolvedValue(runningJob);
  vi.mocked(api.listRuns).mockResolvedValue([]);
  vi.mocked(api.getRun).mockResolvedValue(null);   // no prior outcomes by default
});

describe('ReviewTab', () => {
  it('renders a completed report: summary, gap, health, drift', async () => {
    render(<ReviewTab instances={['local']} />);
    await waitFor(() => expect(screen.getByText('Found a patch gap.')).toBeInTheDocument());
    expect(screen.getByText('Patch loop')).toBeInTheDocument();
    expect(screen.getByText('harden: obsidian')).toBeInTheDocument();        // target-skill badge
    expect(screen.getByText(/Patch checklist/)).toBeInTheDocument();         // suggested edit
    expect(screen.getByText(/subtle append guidance/)).toBeInTheDocument();  // health
    expect(screen.getByText(/not on every instance/)).toBeInTheDocument();   // drift
  });

  it('shows past reviews from the ledger', async () => {
    vi.mocked(api.listRuns).mockResolvedValue([
      { run_id: '20260630T120000Z', instance: 'local', started_at: '', finished_at: '',
        status: 'done', model: 'm', trigger: 'scheduled', gap_count: 3, applied_count: 1 },
    ]);
    render(<ReviewTab instances={['local']} />);
    expect(await screen.findByText('scheduled')).toBeInTheDocument();
    expect(screen.getByText(/3 gaps · 1 applied/)).toBeInTheDocument();
  });

  it('hides Prepare-edit unless write-back is enabled', async () => {
    render(<ReviewTab instances={['local']} />);
    await waitFor(() => expect(screen.getByText('Patch loop')).toBeInTheDocument());
    expect(screen.queryByText('Prepare edit')).not.toBeInTheDocument();
  });

  it('prepares and applies an edit via the diff modal', async () => {
    vi.mocked(api.proposeEdit).mockResolvedValue({
      proposal_id: 'p1', run_id: '20260630T120000Z', gap_index: 0, skill_name: 'obsidian',
      path: '/h/skills/note-taking/obsidian/SKILL.md', is_new: false, old_sha256: 'abc',
      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new line\n', change_note: 'added a rule',
      warnings: [], injection_flags: [],
    });
    vi.mocked(api.applyEdit).mockResolvedValue({
      gap_index: 0, status: 'applied', path: '/h/skills/note-taking/obsidian/SKILL.md',
      backup_path: '/state/x.bak', new_sha256: 'def', applied_at: '', error: '',
    });
    render(<ReviewTab instances={['local']} writebackEnabled />);
    await waitFor(() => expect(screen.getByText('Patch loop')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Prepare edit'));
    await waitFor(() => expect(api.proposeEdit).toHaveBeenCalledWith('local', '20260630T120000Z', 0));
    const approve = await screen.findByText('Approve & write');
    fireEvent.click(approve);
    await waitFor(() => expect(api.applyEdit).toHaveBeenCalledWith('local', 'p1'));
    expect(await screen.findByText('✓ applied')).toBeInTheDocument();
    expect(screen.getByText('/state/x.bak')).toBeInTheDocument();
    // the gap is applied -> Prepare edit must not be offered again
    expect(screen.queryByText('Prepare edit')).not.toBeInTheDocument();
  });

  it('reflects an already-applied gap from the ledger on mount (survives navigation)', async () => {
    vi.mocked(api.getRun).mockResolvedValue({
      report,
      gaps: [{ gap: report.gaps[0], outcome: {
        gap_index: 0, status: 'applied', path: '/h/skills/obsidian/SKILL.md',
        backup_path: '/state/y.bak', new_sha256: 'x', applied_at: '', error: '',
      } }],
      trigger: 'manual', created_at: '',
    });
    render(<ReviewTab instances={['local']} writebackEnabled />);
    expect(await screen.findByText('✓ applied')).toBeInTheDocument();
    expect(screen.queryByText('Prepare edit')).not.toBeInTheDocument();  // no re-prepare
  });

  it('runs a review on click', async () => {
    render(<ReviewTab instances={['local']} />);
    fireEvent.click(screen.getByText('Run review'));
    await waitFor(() => expect(api.runReview).toHaveBeenCalledWith('local'));
  });

  it('shows an in-progress indicator while a run is live (server-driven)', async () => {
    vi.mocked(api.fetchStatus).mockResolvedValue(runningJob);
    render(<ReviewTab instances={['local']} />);
    // the button reflects server-side job state, so the indicator survives remounts
    const btn = await screen.findByText('Reviewing…');
    expect(btn.closest('button')!.disabled).toBe(true);
  });
});
