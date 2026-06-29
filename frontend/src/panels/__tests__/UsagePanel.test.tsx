import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UsagePanel } from '../UsagePanel';
import { sampleOverview } from '../../sample';

describe('UsagePanel', () => {
  it('renders headline stat labels', () => {
    render(<UsagePanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('sessions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('tool calls').length).toBeGreaterThan(0);
    expect(screen.getAllByText('tokens').length).toBeGreaterThan(0);
  });

  it('formats large token totals as M', () => {
    render(<UsagePanel instances={sampleOverview.instances} />);
    // 5,524,527 total -> 5.5M (also appears as the grok-4.3 model total)
    expect(screen.getAllByText('5.5M').length).toBeGreaterThan(0);
  });

  it('renders model names', () => {
    render(<UsagePanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('grok-4.3').length).toBeGreaterThan(0);
    expect(screen.getByText('grok-build-0.1')).toBeInTheDocument();
  });

  it('renders top tool names', () => {
    render(<UsagePanel instances={sampleOverview.instances} />);
    expect(screen.getByText('computer_use')).toBeInTheDocument();
  });

  it('renders instance names', () => {
    render(<UsagePanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });
});
