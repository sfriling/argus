import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SummaryView } from '../SummaryView';
import { sampleOverview } from '../../sample';
import type { Overview } from '../../types';

describe('SummaryView', () => {
  it('renders the section labels', () => {
    render(<SummaryView overview={sampleOverview} onNavigate={() => {}} />);
    expect(screen.getByText('Fleet')).toBeInTheDocument();
    expect(screen.getByText('Live Now')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders per-instance health and live-now counts', () => {
    render(<SummaryView overview={sampleOverview} onNavigate={() => {}} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getByText('vps')).toBeInTheDocument();
    expect(screen.getByText('1 active')).toBeInTheDocument(); // one active claude agent
    expect(screen.getByText('catches')).toBeInTheDocument();
    expect(screen.getByText('loop-breaks')).toBeInTheDocument();
  });

  it('shows the attention strip (warns for the sample with a blocked task / loop-break)', () => {
    render(<SummaryView overview={sampleOverview} onNavigate={() => {}} />);
    expect(screen.getByText(/kanban task.*blocked/)).toBeInTheDocument();
  });

  it('shows "All systems nominal" when healthy', () => {
    const clean: Overview = {
      ...sampleOverview,
      instances: sampleOverview.instances.map((i) => ({
        ...i,
        kanban: { counts: {}, in_flight: [] },
        reliability: { configured: true, today: { catches: 0, loop_breaks: 0 }, recent: [] },
      })),
    };
    render(<SummaryView overview={clean} onNavigate={() => {}} />);
    expect(screen.getByText('All systems nominal')).toBeInTheDocument();
  });

  it('hides the reliability tiles when no instance has guard data', () => {
    const noRel: Overview = {
      ...sampleOverview,
      instances: sampleOverview.instances.map((i) => ({
        ...i,
        reliability: { configured: false, today: { catches: 0, loop_breaks: 0 }, recent: [] },
      })),
    };
    render(<SummaryView overview={noRel} onNavigate={() => {}} />);
    expect(screen.queryByText('catches')).not.toBeInTheDocument();
    expect(screen.queryByText('loop-breaks')).not.toBeInTheDocument();
    expect(screen.getByText('tokens · 7d')).toBeInTheDocument();  // other tiles remain
  });

  it('navigates when a live card is clicked', () => {
    const onNavigate = vi.fn();
    render(<SummaryView overview={sampleOverview} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Claude agents'));
    expect(onNavigate).toHaveBeenCalledWith('agents');
  });
});
