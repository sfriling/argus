import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ReviewTab } from '../ReviewTab';
import * as api from '../api';
import type { ReviewReport } from '../../types';

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

beforeEach(() => {
  vi.mocked(api.fetchReport).mockResolvedValue(report);
  vi.mocked(api.runReview).mockResolvedValue(report);
});

describe('ReviewTab', () => {
  it('renders a cached report: summary, gap, health, drift', async () => {
    render(<ReviewTab instances={['local']} />);
    await waitFor(() => expect(screen.getByText('Found a patch gap.')).toBeInTheDocument());
    expect(screen.getByText('Patch loop')).toBeInTheDocument();
    expect(screen.getByText('harden: obsidian')).toBeInTheDocument();        // target-skill badge
    expect(screen.getByText(/Patch checklist/)).toBeInTheDocument();         // suggested edit
    expect(screen.getByText(/subtle append guidance/)).toBeInTheDocument();  // health
    expect(screen.getByText(/not on every instance/)).toBeInTheDocument();   // drift
  });

  it('runs a review on click', async () => {
    render(<ReviewTab instances={['local']} />);
    fireEvent.click(screen.getByText('Run review'));
    await waitFor(() => expect(api.runReview).toHaveBeenCalledWith('local'));
  });
});
