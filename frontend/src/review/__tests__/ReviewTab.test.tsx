import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ReviewTab } from '../ReviewTab';
import * as api from '../api';
import type { ReviewReport, ReviewJob } from '../../types';

vi.mock('../api');

const report: ReviewReport = {
  generated_at: '', instance: 'local', model: 'claude-opus-4-8', sessions_reviewed: ['s1'],
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
