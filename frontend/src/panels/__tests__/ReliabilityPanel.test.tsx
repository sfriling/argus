import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ReliabilityPanel } from '../ReliabilityPanel';
import { sampleOverview } from '../../sample';

describe('ReliabilityPanel', () => {
  it('renders "Reliability" section heading', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('Reliability')).toBeInTheDocument();
  });

  it('renders instance names', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });

  it('shows "catches" and "loop breaks" labels', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('catches').length).toBeGreaterThan(0);
    expect(screen.getAllByText('loop breaks').length).toBeGreaterThan(0);
  });

  it('shows today catch count for local (2)', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    // local today: catches=2
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThan(0);
  });

  it('renders recent tool names', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('patch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('cronjob').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bash').length).toBeGreaterThan(0);
  });

  it('renders action badges including inferred and rejected', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('inferred').length).toBeGreaterThan(0);
    // rejected entries may have ×N suffix so use regex
    expect(screen.getAllByText(/rejected/).length).toBeGreaterThan(0);
  });

  it('shows "Recent" and "Today" section labels', () => {
    render(<ReliabilityPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('Recent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
  });
});
